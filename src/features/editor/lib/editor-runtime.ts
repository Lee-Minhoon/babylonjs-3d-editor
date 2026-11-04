import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Scene } from "@babylonjs/core/scene";

import { type AddMenu, createAddMenu } from "./add-menu";
import {
  type Autosave,
  type AutosaveStorage,
  createAutosave,
} from "./autosave";
import { type BoxSelect, createBoxSelect } from "./box-select";
import { bindCameraControls } from "./camera-controls";
import { type CameraView, createCameraView } from "./camera-views";
import { type Clipboard, createClipboard } from "./clipboard";
import { type ContextMenu, createContextMenu } from "./context-menu";
import { createHistory, type History } from "./history";
import { createPlacementTool, type PlacementTool } from "./placement-tool";
import { bindPointerRouter } from "./pointer-router";
import { createSceneExport, type SceneExport } from "./scene-export";
import {
  createSceneFile,
  type SceneFile,
  type SceneFileNotice,
} from "./scene-file";
import { createSelection, type Selection } from "./selection";
import { createShortcutHelp, type ShortcutHelp } from "./shortcut-help";
import { createToolState, type ToolState } from "./tools";
import { createTransformGizmo, type TransformGizmo } from "./transform-gizmo";

/*
 * 에디터 도구들의 조립 지점 (composition root). 씬과 카메라가 준비되면 도구들을 만들어 서로 이어 주고,
 * dispose에서 만든 역순으로 해제한다. 브라우저 이벤트(키보드 단축키·탭 숨김·인스펙터)는 여기서 붙이지 않는다
 * — DOM이 필요한 배선은 뷰포트 컴포넌트가 하고, 여기는 NullEngine으로 단위 테스트할 수 있는 순수 TS만 둔다.
 */

/** 뷰포트가 만들어 에디터 UI에 넘겨주는 씬과 씬에 붙은 도구들 */
export type EditorRuntime = {
  scene: Scene;
  sceneExport: SceneExport;
  help: ShortcutHelp;
  addMenu: AddMenu;
  contextMenu: ContextMenu;
  cameraView: CameraView;
  boxSelect: BoxSelect;
  gizmo: TransformGizmo;
  history: History;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
  clipboard: Clipboard;
  sceneFile: SceneFile;
  autosave: Autosave;
};

export function createEditorRuntime(
  scene: Scene,
  camera: ArcRotateCamera,
  {
    notify,
    autosaveStorage,
  }: {
    /** 저장 완료·열기 실패·자동 저장 오류 등 사용자 알림 (토스트) */
    notify: (notice: SceneFileNotice) => void;
    autosaveStorage: AutosaveStorage;
  },
): { runtime: EditorRuntime; dispose(): void } {
  const history = createHistory();
  const tools = createToolState();
  const placement = createPlacementTool(scene, history, tools);
  const selection = createSelection(scene);
  const gizmo = createTransformGizmo(scene, {
    history,
    selection,
    tools,
    placement,
  });
  const cameraView = createCameraView(camera);
  const unbindCamera = bindCameraControls(camera, { tools, placement });
  const boxSelect = createBoxSelect(scene, selection);
  const contextMenu = createContextMenu();
  const unbindPointer = bindPointerRouter(scene, {
    gizmo,
    placement,
    selection,
    tools,
    boxSelect,
    contextMenu,
  });
  const clipboard = createClipboard();
  const help = createShortcutHelp();
  const addMenu = createAddMenu();
  const sceneFile = createSceneFile(scene, {
    history,
    selection,
    placement,
    notify,
  });
  const sceneExport = createSceneExport(scene, {
    getFileName: () => sceneFile.getState().fileName,
    notify,
  });
  const autosave = createAutosave({
    sceneFile,
    storage: autosaveStorage,
    onError: (title, description) =>
      notify({ type: "error", title, description }),
  });

  return {
    runtime: {
      scene,
      sceneExport,
      help,
      addMenu,
      contextMenu,
      cameraView,
      boxSelect,
      gizmo,
      history,
      placement,
      selection,
      tools,
      clipboard,
      sceneFile,
      autosave,
    },
    dispose() {
      // 내용은 동기로 읽어 두므로 씬이 해제되기 전에 남길 수 있다
      void autosave.flush();
      autosave.dispose();
      sceneFile.dispose();
      unbindPointer();
      boxSelect.dispose();
      unbindCamera();
      cameraView.dispose();
      gizmo.dispose();
      selection.dispose();
      placement.dispose();
      // undo로 씬에서 떼어둔 메쉬는 scene.dispose()가 모르므로 여기서 해제
      history.dispose();
    },
  };
}
