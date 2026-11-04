"use client";

import { useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { AutosaveState } from "../lib/autosave";
import type { ScreenRect } from "../lib/box-select";
import type { ContextMenuState } from "../lib/context-menu";
import type { EditorRuntime } from "../lib/editor-runtime";
import type { HistoryState } from "../lib/history";
import type { MeshPresetId } from "../lib/mesh-presets";
import type { PlacementState } from "../lib/placement-tool";
import type { SceneFileState } from "../lib/scene-file";
import {
  DEFAULT_GIZMO_SPACE,
  DEFAULT_SNAP_ENABLED,
  DEFAULT_SNAP_STEPS,
  DEFAULT_TOOL,
  type GizmoSpace,
  type SnapKind,
  type TransformTool,
} from "../lib/tools";

/*
 * 에디터 도구 상태 구독 훅 모음. runtime이 아직 없으면(씬 준비 전) 기본값을 돌려준다.
 * 도구 객체는 subscribe/getX를 제공하고, 여기서 useSyncExternalStore로 감싼다.
 */

const subscribeNoop = () => () => {};
const getNull = () => null;
const EMPTY_HISTORY: HistoryState = {
  undoLabel: null,
  redoLabel: null,
  entries: [],
  position: 0,
};
const getEmptyHistory = () => EMPTY_HISTORY;
const getDefaultTool = (): TransformTool => DEFAULT_TOOL;
const getFalse = () => false;
const getDefaultSnapEnabled = () => DEFAULT_SNAP_ENABLED;
const getDefaultGizmoSpace = (): GizmoSpace => DEFAULT_GIZMO_SPACE;
const EMPTY_SCENE_FILE: SceneFileState = {
  fileName: null,
  dirty: false,
  confirmPending: false,
};
const getEmptySceneFile = () => EMPTY_SCENE_FILE;
const EMPTY_AUTOSAVE: AutosaveState = { pending: null };
const getEmptyAutosave = () => EMPTY_AUTOSAVE;

type Runtime = EditorRuntime | null;

export function useHistoryState(runtime: Runtime): HistoryState {
  const history = runtime?.history;
  return useSyncExternalStore(
    history?.subscribe ?? subscribeNoop,
    history?.getState ?? getEmptyHistory,
    getEmptyHistory,
  );
}

const EMPTY_SELECTION: readonly AbstractMesh[] = [];
const getEmptySelection = () => EMPTY_SELECTION;

/** 선택된 메쉬들 (고른 순서) */
export function useSelection(runtime: Runtime): readonly AbstractMesh[] {
  const selection = runtime?.selection;
  return useSyncExternalStore(
    selection?.subscribe ?? subscribeNoop,
    selection?.getMeshes ?? getEmptySelection,
    getEmptySelection,
  );
}

/** 배치 모드의 프리셋 id (배치 중이 아니면 null) */
export function useActivePresetId(runtime: Runtime): MeshPresetId | null {
  const placement = runtime?.placement;
  return useSyncExternalStore(
    placement?.subscribe ?? subscribeNoop,
    placement?.getActivePresetId ?? getNull,
    getNull,
  );
}

export function useActiveTool(runtime: Runtime): TransformTool {
  const tools = runtime?.tools;
  return useSyncExternalStore(
    tools?.subscribe ?? subscribeNoop,
    tools?.getTool ?? getDefaultTool,
    getDefaultTool,
  );
}

/** 스냅 켜짐 여부와 이 종류(위치·회전·크기)의 단위 */
export function useSnap(
  runtime: Runtime,
  kind: SnapKind,
): { enabled: boolean; step: number } {
  const tools = runtime?.tools;
  const enabled = useSyncExternalStore(
    tools?.subscribe ?? subscribeNoop,
    tools?.isSnapEnabled ?? getDefaultSnapEnabled,
    getDefaultSnapEnabled,
  );
  const getDefaultStep = () => DEFAULT_SNAP_STEPS[kind];
  const step = useSyncExternalStore(
    tools?.subscribe ?? subscribeNoop,
    tools ? () => tools.getSnapStep(kind) : getDefaultStep,
    getDefaultStep,
  );
  return { enabled, step };
}

/** 기즈모 축 방향 (로컬/월드) */
export function useGizmoSpace(runtime: Runtime): GizmoSpace {
  const tools = runtime?.tools;
  return useSyncExternalStore(
    tools?.subscribe ?? subscribeNoop,
    tools?.getGizmoSpace ?? getDefaultGizmoSpace,
    getDefaultGizmoSpace,
  );
}

/** 클립보드에 붙여넣을 내용이 있는지 */
export function useClipboardHasContent(runtime: Runtime): boolean {
  const clipboard = runtime?.clipboard;
  return useSyncExternalStore(
    clipboard?.subscribe ?? subscribeNoop,
    clipboard?.hasContent ?? getFalse,
    getFalse,
  );
}

/** 배치 모드 상태 (프리셋 배치 / 붙여넣기·복제 배치). 배치 중이 아니면 null */
export function usePlacementState(runtime: Runtime): PlacementState | null {
  const placement = runtime?.placement;
  return useSyncExternalStore(
    placement?.subscribe ?? subscribeNoop,
    placement?.getState ?? getNull,
    getNull,
  );
}

/** 편집 중인 씬 파일: 이름·저장 안 된 변경·확인 대화상자 */
export function useSceneFileState(runtime: Runtime): SceneFileState {
  const sceneFile = runtime?.sceneFile;
  return useSyncExternalStore(
    sceneFile?.subscribe ?? subscribeNoop,
    sceneFile?.getState ?? getEmptySceneFile,
    getEmptySceneFile,
  );
}

/** 자동 저장: 복구할지 묻는 중인 기록 */
export function useAutosaveState(runtime: Runtime): AutosaveState {
  const autosave = runtime?.autosave;
  return useSyncExternalStore(
    autosave?.subscribe ?? subscribeNoop,
    autosave?.getState ?? getEmptyAutosave,
    getEmptyAutosave,
  );
}

/** 직교 투영인지 (숫자패드 5·보기 메뉴) */
export function useOrthographic(runtime: Runtime): boolean {
  const cameraView = runtime?.cameraView;
  return useSyncExternalStore(
    cameraView?.subscribe ?? subscribeNoop,
    cameraView?.isOrthographic ?? getFalse,
    getFalse,
  );
}

/** 드래그 중인 박스 선택 사각형 (캔버스 기준 CSS 픽셀). 없으면 null */
export function useBoxSelectRect(runtime: Runtime): ScreenRect | null {
  const boxSelect = runtime?.boxSelect;
  return useSyncExternalStore(
    boxSelect?.subscribe ?? subscribeNoop,
    boxSelect?.getRect ?? getNull,
    getNull,
  );
}

const CLOSED_CONTEXT_MENU: ContextMenuState = { open: false };
const getClosedContextMenu = () => CLOSED_CONTEXT_MENU;

/** 우클릭 메뉴 상태 */
export function useContextMenuState(runtime: Runtime): ContextMenuState {
  const contextMenu = runtime?.contextMenu;
  return useSyncExternalStore(
    contextMenu?.subscribe ?? subscribeNoop,
    contextMenu?.getState ?? getClosedContextMenu,
    getClosedContextMenu,
  );
}
