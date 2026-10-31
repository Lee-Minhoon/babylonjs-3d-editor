import { describe, expect, test, vi } from "vitest";

import { createToolState, snapKindForTool } from "./tools";

describe("tool state", () => {
  test("스냅 단위는 종류별로 따로, 켜기/끄기는 함께", () => {
    const tools = createToolState();
    tools.setSnapStep("rotate", 45);
    expect(tools.getActiveSnap("rotate")).toBe(45);
    expect(tools.getActiveSnap("move")).toBe(0.5);

    tools.setSnapEnabled(false);
    expect(tools.getActiveSnap("rotate")).toBeNull();
    expect(tools.getActiveSnap("scale")).toBeNull();
    expect(tools.getSnapStep("rotate")).toBe(45);
  });

  test("같은 값이면 알리지 않는다", () => {
    const tools = createToolState();
    const onChange = vi.fn();
    tools.subscribe(onChange);
    tools.setGizmoSpace("local");
    tools.setSnapStep("move", 0.5);
    expect(onChange).not.toHaveBeenCalled();
    tools.setGizmoSpace("world");
    expect(onChange).toHaveBeenCalledOnce();
  });

  test("선택 도구는 배치용 이동 스냅을 쓴다", () => {
    expect(snapKindForTool("select")).toBe("move");
    expect(snapKindForTool("rotate")).toBe("rotate");
  });
});
