import type { Scene } from "@babylonjs/core/scene";

import { openFile, saveFile } from "@/lib/file-access";
import { createListeners } from "@/lib/listeners";

import type { Asset, AssetStore } from "./asset-store";
import type { History, HistoryMark } from "./history";
import type { PlacementTool } from "./placement-tool";
import {
  clearEditorMeshes,
  loadSceneFile,
  parseSceneFile,
  SCENE_FILE_TYPE,
  SCENE_PACKAGE_TYPE,
  SceneFileError,
  serializeScene,
  stringifySceneFile,
} from "./scene-format";
import {
  assetEntry,
  loadSceneAssets,
  packScene,
  readSceneBytes,
} from "./scene-package";
import { applySceneSettings, DEFAULT_SCENE_SETTINGS } from "./scene-settings";
import type { Selection } from "./selection";

/*
 * 지금 편집 중인 씬 파일(문서) 상태: 파일 이름·핸들, 저장 안 된 변경 여부, 새 씬/열기/저장.
 * 새 씬·열기는 히스토리를 비운다 (undo 대상 아님).
 * 저장 안 된 변경이 있으면 버릴지 묻는다 — 질문은 상태(confirmPending)로 내보내고 UI가 대화상자를 띄운다.
 * 자동 저장(autosave.ts)은 serialize로 내용을 받고, 복구는 restore로 한다.
 * 에셋(가져온 모델·텍스처)을 쓰는 씬은 .zip 묶음(scene-package)으로, 아니면 .json으로 저장한다.
 * .json으로 열었던 씬에 에셋이 생기면 저장할 때 .zip 위치를 새로 묻는다. 한 번 묶음이면 계속 묶음.
 */

/** 씬 내용: 씬 파일 텍스트와 그 씬이 쓰는 에셋 */
export type SceneContent = {
  text: string;
  assets: readonly Asset[];
};

export type SceneFileNotice = {
  type: "success" | "error";
  title: string;
  description?: string;
};

export type SceneFileState = {
  /** 저장·열기 전이면 null ("제목 없음") */
  fileName: string | null;
  dirty: boolean;
  /** 변경 사항을 버릴지 묻는 중 (UI가 resolveConfirm으로 답한다) */
  confirmPending: boolean;
};

export type SceneFile = {
  newScene(): Promise<void>;
  open(): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  /** 지금 씬 내용 (자동 저장용) */
  serialize(): SceneContent;
  /**
   * 자동 저장한 내용으로 씬을 바꾼다 (히스토리는 비움). 파일로 저장하기 전까지 "변경 있음" 상태로 둔다.
   * 내용이 잘못됐거나 에셋을 불러올 수 없으면 SceneFileError — 이때 씬은 그대로다.
   */
  restore(content: SceneContent, fileName: string | null): Promise<void>;
  resolveConfirm(discard: boolean): void;
  getState(): SceneFileState;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

const DEFAULT_BASE_NAME = "scene";

/** "a.json" → "a.zip" (확장자가 없으면 붙인다) */
const withExtension = (name: string, extension: string) =>
  `${name.replace(/\.(json|zip)$/i, "")}${extension}`;

export function createSceneFile(
  scene: Scene,
  {
    history,
    selection,
    placement,
    assets,
    notify,
  }: {
    history: History;
    selection: Selection;
    placement: PlacementTool;
    assets: AssetStore;
    /** 저장 완료·열기 실패 등 사용자 알림 (토스트) */
    notify: (notice: SceneFileNotice) => void;
  },
): SceneFile {
  let fileName: string | null = null;
  let handle: FileSystemFileHandle | null = null;
  /** 저장(또는 열기) 시점의 history.mark(). 지금 값과 다르면 변경이 있는 것 */
  let savedMark: HistoryMark = history.mark();
  /** 자동 저장에서 복구한 직후: 히스토리는 비었지만 파일로는 저장되지 않은 상태 */
  let restored = false;
  let pendingConfirm: ((discard: boolean) => void) | null = null;
  /** 피커·저장이 진행 중이면 다음 요청을 무시한다 (단축키 연타) */
  let busy = false;

  const listeners = createListeners();
  let state: SceneFileState = {
    fileName,
    dirty: false,
    confirmPending: false,
  };
  const emit = () => {
    state = {
      fileName,
      dirty: restored || history.mark() !== savedMark,
      confirmPending: pendingConfirm !== null,
    };
    listeners.emit();
  };
  const unsubscribeHistory = history.subscribe(emit);

  const confirmDiscard = (): Promise<boolean> => {
    if (!state.dirty) return Promise.resolve(true);
    return new Promise((resolve) => {
      pendingConfirm = resolve;
      emit();
    });
  };

  /** 씬을 비우고 설정을 기본값으로 돌린 뒤(필요하면 파일 내용을 채우고) 히스토리를 처음 상태로 만든다 */
  const replaceScene = (load?: (scene: Scene) => void) => {
    placement.cancel();
    selection.select(null);
    // 먼저 비워야 undo로 떼어둔 메쉬가 Command와 함께 해제된다
    history.clear();
    clearEditorMeshes(scene);
    applySceneSettings(scene, DEFAULT_SCENE_SETTINGS);
    load?.(scene);
    savedMark = history.mark();
    restored = false;
  };

  /** busy 동안 겹쳐 실행하지 않고, 예상 못 한 에러는 알림으로 보여준다 */
  const run = async (task: () => Promise<void>, failTitle: string) => {
    if (busy || pendingConfirm) return;
    busy = true;
    try {
      await task();
    } catch (error) {
      notify({
        type: "error",
        title: failTitle,
        description:
          error instanceof Error ? error.message : "알 수 없는 오류입니다.",
      });
    } finally {
      busy = false;
    }
  };

  const serialize = (): SceneContent => {
    const data = serializeScene(scene);
    return {
      text: stringifySceneFile(data),
      assets: data.assets.map(({ id }) => assets.get(id)!),
    };
  };

  /** 씬 텍스트와 에셋을 불러와 씬을 바꾼다. 실패하면(SceneFileError) 씬은 그대로 */
  const load = async (text: string, files: ReadonlyMap<string, Uint8Array>) => {
    const file = parseSceneFile(text);
    await loadSceneAssets(assets, file.assets, files);
    replaceScene((target) => loadSceneFile(target, file));
  };

  const write = async (pickLocation: boolean) => {
    // 파일에 쓴 내용의 시점을 기억한다 — 쓰는 동안(핸들 저장은 모달이 없다) 편집이 이어져도
    // 그 편집은 파일에 없으므로 "변경 있음"이어야 한다
    const mark = history.mark();
    const content = serialize();
    const isPackage =
      content.assets.length > 0 ||
      (fileName?.toLowerCase().endsWith(SCENE_PACKAGE_TYPE.extension) ?? false);
    const type = isPackage ? SCENE_PACKAGE_TYPE : SCENE_FILE_TYPE;
    // .json으로 열었는데 에셋이 생겼으면 같은 파일에 덮어쓰지 않고 .zip 위치를 묻는다
    const sameKind =
      fileName === null || fileName.toLowerCase().endsWith(type.extension);
    const saved = await saveFile(
      isPackage
        ? new Blob([packScene(content.text, content.assets) as BlobPart], {
            type: type.mimeType,
          })
        : content.text,
      {
        handle: pickLocation || !sameKind ? null : handle,
        suggestedName: withExtension(
          fileName ?? DEFAULT_BASE_NAME,
          type.extension,
        ),
        type,
      },
    );
    if (!saved) return;
    fileName = saved.name;
    handle = saved.handle;
    savedMark = mark;
    restored = false;
    emit();
    notify({ type: "success", title: `${saved.name} 저장됨` });
  };

  // 저장 안 된 변경이 있으면 탭 닫기·새로고침 전에 브라우저가 확인한다
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (state.dirty) event.preventDefault();
  };
  // (window가 없는 단위 테스트 환경에서도 만들 수 있게)
  globalThis.addEventListener?.("beforeunload", onBeforeUnload);

  return {
    newScene: () =>
      run(async () => {
        if (!(await confirmDiscard())) return;
        replaceScene();
        fileName = null;
        handle = null;
        emit();
      }, "새 씬을 만들지 못했습니다"),

    open: () =>
      run(async () => {
        if (!(await confirmDiscard())) return;
        const opened = await openFile([SCENE_FILE_TYPE, SCENE_PACKAGE_TYPE]);
        if (!opened) return;

        try {
          const { text, files } = readSceneBytes(opened.bytes);
          await load(text, files);
        } catch (error) {
          // 파싱에 실패하면 지금 씬은 그대로 둔다
          if (error instanceof SceneFileError) {
            notify({
              type: "error",
              title: `${opened.name}을(를) 열 수 없습니다`,
              description: error.message,
            });
            return;
          }
          throw error;
        }
        fileName = opened.name;
        handle = opened.handle;
        emit();
      }, "파일을 열지 못했습니다"),

    save: () => run(() => write(false), "저장하지 못했습니다"),
    saveAs: () => run(() => write(true), "저장하지 못했습니다"),

    serialize,
    async restore(content, name) {
      await load(
        content.text,
        new Map(
          content.assets.map((asset) => [assetEntry(asset), asset.bytes]),
        ),
      );
      fileName = name;
      // 파일 핸들은 복구하지 않는다 → 첫 저장 때 위치를 다시 묻는다
      handle = null;
      restored = true;
      emit();
    },

    resolveConfirm(discard) {
      const resolve = pendingConfirm;
      pendingConfirm = null;
      emit();
      resolve?.(discard);
    },
    getState: () => state,
    subscribe: listeners.subscribe,
    dispose() {
      pendingConfirm?.(false);
      pendingConfirm = null;
      unsubscribeHistory();
      globalThis.removeEventListener?.("beforeunload", onBeforeUnload);
      listeners.clear();
    },
  };
}
