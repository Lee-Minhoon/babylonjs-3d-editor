/** 뷰포트 기본 도구. 배치 모드(placement)는 이 위에 잠깐 덮어쓰는 모드다. */
export type TransformTool = "select" | "move" | "rotate" | "scale";

export type ToolState = {
  getTool(): TransformTool;
  setTool(tool: TransformTool): void;
  subscribe(onChange: () => void): () => void;
};

export function createToolState(initial: TransformTool = "move"): ToolState {
  let tool = initial;
  const listeners = new Set<() => void>();

  return {
    getTool: () => tool,
    setTool(next) {
      if (next === tool) return;
      tool = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
