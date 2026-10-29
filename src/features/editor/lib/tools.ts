import { createListeners } from "@/lib/listeners";
/** 뷰포트 기본 도구. 배치 모드(placement)는 이 위에 잠깐 덮어쓰는 모드다. */
export type TransformTool = "select" | "move" | "rotate" | "scale";

/** 고를 수 있는 위치 스냅 단위 (배치 X/Z, 이동 기즈모) */
export const SNAP_STEPS = [0.1, 0.25, 0.5, 1] as const;
/** 기본값 — 씬이 준비되기 전 UI도 같은 값을 보여준다 (use-editor-state) */
export const DEFAULT_TOOL: TransformTool = "move";
export const DEFAULT_SNAP_ENABLED = true;
export const DEFAULT_SNAP_STEP = 0.5;

export type ToolState = {
  getTool(): TransformTool;
  setTool(tool: TransformTool): void;
  isSnapEnabled(): boolean;
  setSnapEnabled(enabled: boolean): void;
  getSnapStep(): number;
  setSnapStep(step: number): void;
  /** 지금 적용할 스냅 단위. 스냅이 꺼져 있으면 null */
  getActiveSnap(): number | null;
  subscribe(onChange: () => void): () => void;
};

export function createToolState(
  initial: TransformTool = DEFAULT_TOOL,
): ToolState {
  let tool = initial;
  let snapEnabled = DEFAULT_SNAP_ENABLED;
  let snapStep = DEFAULT_SNAP_STEP;
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
    getSnapStep: () => snapStep,
    setSnapStep(step) {
      if (step === snapStep || !(step > 0)) return;
      snapStep = step;
      emit();
    },
    getActiveSnap: () => (snapEnabled ? snapStep : null),
    subscribe: listeners.subscribe,
  };
}

/** step 단위로 반올림 (step이 null이면 그대로) */
export function snapValue(value: number, step: number | null): number {
  if (!step) return value;
  // 0.1 같은 단위의 부동소수 오차(0.30000000000000004) 정리
  return Number((Math.round(value / step) * step).toFixed(6));
}
