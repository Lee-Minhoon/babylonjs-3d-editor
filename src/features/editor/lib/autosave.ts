import { createKeyValueStore } from "@/lib/kv-store";
import { createListeners } from "@/lib/listeners";

import type { SceneFile } from "./scene-file";
import { SceneFileError } from "./scene-format";

/*
 * 자동 저장과 복구. 파일로 저장하지 않은 변경이 있으면 잠시(delay) 뒤 브라우저 저장소에 씬을 남기고,
 * 깨끗한 상태(파일 저장·undo로 저장 시점 복귀·새 씬)가 되면 지운다.
 * 다음 실행 때 기록이 있으면 pending으로 알리고, UI(RecoveryDialog)가 복구/버리기를 묻는다.
 * 답을 받기 전에는 아무것도 쓰지 않는다 — 시작 직후의 빈 씬이 기록을 지우면 안 되기 때문.
 *
 * 저장소는 하나뿐이라 여러 탭에서 동시에 편집하면 마지막에 쓴 탭의 내용만 남는다.
 */

export type AutosaveRecord = {
  /** 씬 파일 텍스트 (scene-format) */
  text: string;
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
  recover(): void;
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
          text: sceneFile.serialize(),
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
    recover() {
      if (!record) return;
      try {
        sceneFile.restore(record.text, record.fileName);
      } catch (error) {
        if (!(error instanceof SceneFileError)) throw error;
        onError("자동 저장 기록을 복구하지 못했습니다", error.message);
        void storage.clear();
        stored = false;
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

/** 브라우저(IndexedDB)에 저장하는 기본 저장소 */
export function createBrowserAutosaveStorage(): AutosaveStorage {
  const store = createKeyValueStore("babylonjs-3d-editor");
  const KEY = "autosave";
  return {
    load: async () => (await store.get<AutosaveRecord>(KEY)) ?? null,
    save: (record) => store.set(KEY, record),
    clear: () => store.delete(KEY),
  };
}
