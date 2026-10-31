import { createListeners } from "@/lib/listeners";
/** 뷰포트 기본 도구. 배치 모드(placement)는 이 위에 잠깐 덮어쓰는 모드다. */
export type TransformTool = "select" | "move" | "rotate" | "scale";

/** 스냅 종류: 위치(배치 X/Z·이동 기즈모) · 회전(도) · 크기(배율 변화량) */
export type SnapKind = "move" | "rotate" | "scale";

/** 기즈모 축 방향: 메쉬 자신의 축(local) 또는 월드 축(world). 크기 기즈모는 항상 local */
export type GizmoSpace = "local" | "world";

/** 고를 수 있는 스냅 단위. 스냅 켜기/끄기는 셋이 함께 쓴다 */
export const SNAP_STEPS: Record<SnapKind, readonly number[]> = {
  move: [0.1, 0.25, 0.5, 1],
  rotate: [5, 15, 45, 90],
  scale: [0.1, 0.25, 0.5, 1],
};

/** 기본값 — 씬이 준비되기 전 UI도 같은 값을 보여준다 (use-editor-state) */
export const DEFAULT_TOOL: TransformTool = "move";
export const DEFAULT_SNAP_ENABLED = true;
export const DEFAULT_SNAP_STEPS: Record<SnapKind, number> = {
  move: 0.5,
  rotate: 15,
  scale: 0.1,
};
/** Babylon 기즈모 기본값과 같다 (메쉬를 돌리면 이동 축도 따라 돈다) */
export const DEFAULT_GIZMO_SPACE: GizmoSpace = "local";

/** 이 도구가 쓰는 스냅 종류 (선택 도구는 배치용 위치 스냅) */
export function snapKindForTool(tool: TransformTool): SnapKind {
  return tool === "rotate" || tool === "scale" ? tool : "move";
}

/** UI 표시용 스냅 단위: "0.5" · "15°" · "×0.1" */
export function formatSnapStep(kind: SnapKind, step: number): string {
  if (kind === "rotate") return `${step}°`;
  if (kind === "scale") return `×${step}`;
  return `${step}`;
}

export type ToolState = {
  getTool(): TransformTool;
  setTool(tool: TransformTool): void;
  isSnapEnabled(): boolean;
  setSnapEnabled(enabled: boolean): void;
  getSnapStep(kind: SnapKind): number;
  setSnapStep(kind: SnapKind, step: number): void;
  /** 지금 적용할 스냅 단위 (회전은 도). 스냅이 꺼져 있으면 null */
  getActiveSnap(kind: SnapKind): number | null;
  getGizmoSpace(): GizmoSpace;
  setGizmoSpace(space: GizmoSpace): void;
  subscribe(onChange: () => void): () => void;
};

export function createToolState(
  initial: TransformTool = DEFAULT_TOOL,
): ToolState {
  let tool = initial;
  let snapEnabled = DEFAULT_SNAP_ENABLED;
  let snapSteps = { ...DEFAULT_SNAP_STEPS };
  let gizmoSpace = DEFAULT_GIZMO_SPACE;
  const listeners = createListeners();
  const emit = listeners.emit;

  return {
    getTool: () => tool,
    setTool(next) {
      if (next === tool) return;
      tool = next;
      emit();
    },
    isSnapEnabled: () => snapEnabled,
    setSnapEnabled(enabled) {
      if (enabled === snapEnabled) return;
      snapEnabled = enabled;
      emit();
    },
    getSnapStep: (kind) => snapSteps[kind],
    setSnapStep(kind, step) {
      if (step === snapSteps[kind] || !(step > 0)) return;
      snapSteps = { ...snapSteps, [kind]: step };
      emit();
    },
    getActiveSnap: (kind) => (snapEnabled ? snapSteps[kind] : null),
    getGizmoSpace: () => gizmoSpace,
    setGizmoSpace(space) {
      if (space === gizmoSpace) return;
      gizmoSpace = space;
      emit();
    },
    subscribe: listeners.subscribe,
  };
}

/** step 단위로 반올림 (step이 null이면 그대로) */
export function snapValue(value: number, step: number | null): number {
  if (!step) return value;
  // 0.1 같은 단위의 부동소수 오차(0.30000000000000004) 정리
  return Number((Math.round(value / step) * step).toFixed(6));
}
