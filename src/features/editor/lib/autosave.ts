import { createKeyValueStore, type KeyValueStore } from "@/lib/kv-store";
import { createListeners } from "@/lib/listeners";

import type { Asset } from "./asset-store";
import type { SceneContent, SceneFile } from "./scene-file";
import { SceneFileError } from "./scene-format";

/*
 * 자동 저장과 복구. 파일로 저장하지 않은 변경이 있으면 잠시(delay) 뒤 브라우저 저장소에 씬을 남기고,
 * 깨끗한 상태(파일 저장·undo로 저장 시점 복귀·새 씬)가 되면 지운다.
 * 다음 실행 때 기록이 있으면 pending으로 알리고, UI(RecoveryDialog)가 복구/버리기를 묻는다.
 * 답을 받기 전에는 아무것도 쓰지 않는다 — 시작 직후의 빈 씬이 기록을 지우면 안 되기 때문.
 *
 * 에셋(모델·이미지 바이트)도 함께 남긴다 — 브라우저 저장소는 에셋을 id별로 한 번만 쓴다.
 *
 * 저장소는 하나뿐이라 여러 탭에서 동시에 편집하면 마지막에 쓴 탭의 내용만 남는다.
 */

export type AutosaveRecord = SceneContent & {
  fileName: string | null;
  /** Date.now() */
  savedAt: number;
};

export type AutosaveStorage = {
  load(): Promise<AutosaveRecord | null>;
  save(record: AutosaveRecord): Promise<void>;
  clear(): Promise<void>;
};

export type AutosaveState = {
  /** 복구할지 묻는 중인 기록 (없으면 null) */
  pending: Pick<AutosaveRecord, "fileName" | "savedAt"> | null;
};

export type Autosave = {
  /** 기록으로 씬을 바꾼다 (모델을 불러오느라 비동기) */
  recover(): Promise<void>;
  discard(): void;
  /** 기다리는 저장을 바로 실행 (탭이 숨겨질 때) */
  flush(): Promise<void>;
  getState(): AutosaveState;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

export const AUTOSAVE_DELAY = 1000;

export function createAutosave({
  sceneFile,
  storage,
  delay = AUTOSAVE_DELAY,
  onError,
}: {
  sceneFile: SceneFile;
  storage: AutosaveStorage;
  delay?: number;
  /** 저장소 오류·복구 실패 알림 */
  onError: (title: string, description: string) => void;
}): Autosave {
  let record: AutosaveRecord | null = null;
  let state: AutosaveState = { pending: null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  /** 저장소에 기록이 남아 있는지 (깨끗해졌을 때 한 번만 지우려고 기억한다) */
  let stored = false;
  /** 저장소 오류는 다시 성공할 때까지 한 번만 알린다 (매 변경마다 토스트가 뜨지 않게) */
  let reportedError = false;
  /** 복구 중 (모델을 불러오는 동안 버튼을 다시 눌러도 한 번만) */
  let recovering = false;

  const listeners = createListeners();
  const setPending = (next: AutosaveRecord | null) => {
    record = next;
    state = {
      pending: next && { fileName: next.fileName, savedAt: next.savedAt },
    };
    listeners.emit();
  };

  const write = async () => {
    timer = null;
    const { dirty, fileName } = sceneFile.getState();
    try {
      if (dirty) {
        await storage.save({
          ...sceneFile.serialize(),
          fileName,
          savedAt: Date.now(),
        });
        stored = true;
      } else if (stored) {
        await storage.clear();
        stored = false;
      }
      reportedError = false;
    } catch (error) {
      if (reportedError) return;
      reportedError = true;
      onError(
        "자동 저장을 할 수 없습니다",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void write(), delay);
  };

  const startWatching = () => {
    if (disposed || unsubscribe) return;
    unsubscribe = sceneFile.subscribe(schedule);
    // 복구 직후처럼 이미 변경이 있으면 바로 남긴다
    if (sceneFile.getState().dirty) schedule();
  };

  void storage
    .load()
    .then((saved) => {
      if (disposed) return;
      stored = saved !== null;
      if (saved) setPending(saved);
      else startWatching();
    })
    .catch((error: unknown) => {
      onError(
        "자동 저장 기록을 읽지 못했습니다",
        error instanceof Error ? error.message : String(error),
      );
      startWatching();
    });

  return {
    async recover() {
      if (!record || recovering) return;
      recovering = true;
      try {
        await sceneFile.restore(record, record.fileName);
      } catch (error) {
        if (!(error instanceof SceneFileError)) throw error;
        onError("자동 저장 기록을 복구하지 못했습니다", error.message);
        void storage.clear();
        stored = false;
      } finally {
        recovering = false;
      }
      setPending(null);
      startWatching();
    },
    discard() {
      void storage.clear();
      stored = false;
      setPending(null);
      startWatching();
    },
    async flush() {
      if (!timer) return;
      clearTimeout(timer);
      await write();
    },
    getState: () => state,
    subscribe: listeners.subscribe,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      listeners.clear();
    },
  };
}

/** 저장소에 남기는 모양: 에셋은 id만 (바이트는 "asset:<id>" 키에 따로) */
type StoredRecord = Omit<AutosaveRecord, "assets"> & {
  /** 이전 버전 기록에는 없다 */
  assetIds?: string[];
};

/**
 * 브라우저(IndexedDB)에 저장하는 기본 저장소. 1초마다 몇 MB짜리 모델을 다시 쓰지 않게
 * 에셋은 id(내용 해시)별 키에 한 번만 쓰고, 기록에서 빠진 에셋 키는 지운다.
 */
export function createBrowserAutosaveStorage(
  store: KeyValueStore = createKeyValueStore("babylonjs-3d-editor"),
): AutosaveStorage {
  const KEY = "autosave";
  const assetKey = (id: string) => `asset:${id}`;
  /** 저장소에 있는 에셋 id (load·save가 맞춰 둔다) */
  let storedIds = new Set<string>();

  return {
    async load() {
      const stored = await store.get<StoredRecord>(KEY);
      if (!stored) return null;
      const { assetIds = [], ...rest } = stored;
      const assets = await Promise.all(
        assetIds.map((id) => store.get<Asset>(assetKey(id))),
      );
      storedIds = new Set(assetIds);
      return {
        ...rest,
        assets: assets.filter((asset): asset is Asset => asset !== undefined),
      };
    },
    async save({ assets, ...rest }) {
      for (const asset of assets) {
        if (!storedIds.has(asset.id)) {
          await store.set(assetKey(asset.id), asset);
          storedIds.add(asset.id);
        }
      }
      const ids = assets.map((asset) => asset.id);
      await store.set(KEY, { ...rest, assetIds: ids } satisfies StoredRecord);
      for (const id of storedIds) {
        if (!ids.includes(id)) {
          await store.delete(assetKey(id));
          storedIds.delete(id);
        }
      }
    },
    async clear() {
      await store.delete(KEY);
      for (const id of storedIds) await store.delete(assetKey(id));
      storedIds.clear();
    },
  };
}
