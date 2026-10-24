/** 뷰포트 기본 도구. 배치 모드(placement)는 이 위에 잠깐 덮어쓰는 모드다. */
export type TransformTool = "select" | "move" | "rotate" | "scale";

/** 위치 스냅 단위 (배치 X/Z, 이동 기즈모) */
export const POSITION_SNAP = 0.5;

export type ToolState = {
  getTool(): TransformTool;
  setTool(tool: TransformTool): void;
  isSnapEnabled(): boolean;
  setSnapEnabled(enabled: boolean): void;
  subscribe(onChange: () => void): () => void;
};

export function createToolState(initial: TransformTool = "move"): ToolState {
  let tool = initial;
  let snap = true;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    getTool: () => tool,
    setTool(next) {
      if (next === tool) return;
      tool = next;
      emit();
    },
    isSnapEnabled: () => snap,
    setSnapEnabled(enabled) {
      if (enabled === snap) return;
      snap = enabled;
      emit();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

/** 스냅이 켜져 있으면 POSITION_SNAP 단위로 반올림 */
export function snapValue(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / POSITION_SNAP) * POSITION_SNAP : value;
}
