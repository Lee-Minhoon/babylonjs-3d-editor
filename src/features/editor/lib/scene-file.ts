import type { Scene } from "@babylonjs/core/scene";

import { openTextFile, saveTextFile } from "@/lib/file-access";

import type { Command, History } from "./history";
import type { PlacementTool } from "./placement-tool";
import {
  clearEditorMeshes,
  loadSceneFile,
  parseSceneFile,
  SCENE_FILE_TYPE,
  SceneFileError,
  serializeScene,
  stringifySceneFile,
} from "./scene-format";
import type { Selection } from "./selection";

/*
 * 지금 편집 중인 씬 파일(문서) 상태: 파일 이름·핸들, 저장 안 된 변경 여부, 새 씬/열기/저장.
 * 새 씬·열기는 히스토리를 비운다 (undo 대상 아님).
 * 저장 안 된 변경이 있으면 버릴지 묻는다 — 질문은 상태(confirmPending)로 내보내고 UI가 대화상자를 띄운다.
 * 자동 저장(autosave.ts)은 serialize로 내용을 받고, 복구는 restore로 한다.
 */

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
  /** 지금 씬을 씬 파일 텍스트로 (자동 저장용) */
  serialize(): string;
  /**
   * 자동 저장한 내용으로 씬을 바꾼다 (히스토리는 비움). 파일로 저장하기 전까지 "변경 있음" 상태로 둔다.
   * 내용이 잘못됐으면 SceneFileError — 이때 씬은 그대로다.
   */
  restore(text: string, fileName: string | null): void;
  resolveConfirm(discard: boolean): void;
  getState(): SceneFileState;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

const DEFAULT_FILE_NAME = "scene.json";

export function createSceneFile(
  scene: Scene,
  {
    history,
    selection,
    placement,
    notify,
  }: {
    history: History;
    selection: Selection;
    placement: PlacementTool;
    /** 저장 완료·열기 실패 등 사용자 알림 (토스트) */
    notify: (notice: SceneFileNotice) => void;
  },
): SceneFile {
  let fileName: string | null = null;
  let handle: FileSystemFileHandle | null = null;
  /** 저장(또는 열기) 시점의 history.peek(). 지금 값과 다르면 변경이 있는 것 */
  let savedHead: Command | null = null;
  /** 자동 저장에서 복구한 직후: 히스토리는 비었지만 파일로는 저장되지 않은 상태 */
  let restored = false;
  let pendingConfirm: ((discard: boolean) => void) | null = null;
  /** 피커·저장이 진행 중이면 다음 요청을 무시한다 (단축키 연타) */
  let busy = false;

  const listeners = new Set<() => void>();
  let state: SceneFileState = {
    fileName,
    dirty: false,
    confirmPending: false,
  };
  const emit = () => {
    state = {
      fileName,
      dirty: restored || history.peek() !== savedHead,
      confirmPending: pendingConfirm !== null,
    };
    listeners.forEach((listener) => listener());
  };
  const unsubscribeHistory = history.subscribe(emit);

  const confirmDiscard = (): Promise<boolean> => {
    if (!state.dirty) return Promise.resolve(true);
    return new Promise((resolve) => {
      pendingConfirm = resolve;
      emit();
    });
  };

  /** 씬을 비우고(필요하면 파일 내용을 채우고) 히스토리를 처음 상태로 만든다 */
  const replaceScene = (load?: (scene: Scene) => void) => {
    placement.cancel();
    selection.select(null);
    // 먼저 비워야 undo로 떼어둔 메쉬가 Command와 함께 해제된다
    history.clear();
    clearEditorMeshes(scene);
    load?.(scene);
    savedHead = history.peek();
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

  const write = async (pickLocation: boolean) => {
    const saved = await saveTextFile(
      stringifySceneFile(serializeScene(scene)),
      {
        handle: pickLocation ? null : handle,
        suggestedName: fileName ?? DEFAULT_FILE_NAME,
        type: SCENE_FILE_TYPE,
      },
    );
    if (!saved) return;
    fileName = saved.name;
    handle = saved.handle;
    savedHead = history.peek();
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
        const opened = await openTextFile(SCENE_FILE_TYPE);
        if (!opened) return;

        let file;
        try {
          file = parseSceneFile(opened.text);
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

        replaceScene((target) => loadSceneFile(target, file));
        fileName = opened.name;
        handle = opened.handle;
        emit();
      }, "파일을 열지 못했습니다"),

    save: () => run(() => write(false), "저장하지 못했습니다"),
    saveAs: () => run(() => write(true), "저장하지 못했습니다"),

    serialize: () => stringifySceneFile(serializeScene(scene)),
    restore(text, name) {
      const file = parseSceneFile(text);
      replaceScene((target) => loadSceneFile(target, file));
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
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    dispose() {
      pendingConfirm?.(false);
      pendingConfirm = null;
      unsubscribeHistory();
      globalThis.removeEventListener?.("beforeunload", onBeforeUnload);
      listeners.clear();
    },
  };
}
