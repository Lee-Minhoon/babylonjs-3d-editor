import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test } from "vitest";

import {
  bindCameraControls,
  isBoxSelectDrag,
  leftDragSelects,
} from "./camera-controls";
import { createHistory } from "./history";
import { findPreset } from "./mesh-presets";
import { createPlacementTool } from "./placement-tool";
import { createTestScene } from "./test-scene";
import { createToolState } from "./tools";

function setup() {
  const scene = createTestScene();
  const camera = new ArcRotateCamera("camera", 0, 1, 10, Vector3.Zero(), scene);
  const tools = createToolState("move");
  const placement = createPlacementTool(scene, createHistory(), tools);
  const unbind = bindCameraControls(camera, { tools, placement });
  const resolve = (button: number, modifiers = {}) =>
    camera.movement.input.resolveInteraction("pointer", { button, modifiers })
      ?.interaction ?? null;
  return { scene, camera, tools, placement, unbind, resolve };
}

const pointer = (
  button: number,
  mods: Partial<Record<"shiftKey" | "altKey" | "ctrlKey", boolean>> = {},
) => ({
  button,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...mods,
});

describe("카메라 포인터 규칙", () => {
  test("변형 도구: 왼쪽 회전, 오른쪽·가운데 팬, Shift+왼쪽은 카메라가 무시 (박스 선택)", () => {
    const { resolve } = setup();
    expect(resolve(0)).toBe("rotate");
    expect(resolve(0, { ctrl: true })).toBe("pan");
    expect(resolve(1)).toBe("pan");
    expect(resolve(2)).toBe("pan");
    expect(resolve(0, { shift: true })).toBeNull();
  });

  test("선택 도구: 왼쪽 드래그는 박스 선택, ⌥+왼쪽이 회전. 배치 중엔 다시 회전", () => {
    const { resolve, tools, placement } = setup();
    tools.setTool("select");
    expect(resolve(0)).toBeNull();
    expect(resolve(0, { alt: true })).toBe("rotate");

    placement.toggle(findPreset("box")!);
    expect(leftDragSelects(tools, placement)).toBe(false);
    expect(resolve(0)).toBe("rotate");
    placement.cancel();
    expect(resolve(0)).toBeNull();
  });

  test("배치 중엔 Shift+왼쪽도 회전 (박스 선택이 없는데 카메라까지 무시하면 죽은 입력)", () => {
    const { resolve, tools, placement } = setup();
    for (const tool of ["move", "select"] as const) {
      tools.setTool(tool);
      placement.toggle(findPreset("box")!);
      expect(resolve(0, { shift: true })).toBe("rotate");
      expect(resolve(0, { ctrl: true })).toBe("pan");
      placement.cancel();
      expect(resolve(0, { shift: true })).toBeNull();
    }
  });

  test("휠·키보드 규칙은 건드리지 않는다", () => {
    const { camera, tools } = setup();
    const others = () =>
      camera.movement.input.inputMap.filter((e) => e.source !== "pointer");
    const before = others();
    tools.setTool("select");
    expect(others()).toEqual(before);
    expect(before.some((e) => e.source === "wheel")).toBe(true);
  });
});

describe("박스 선택 시작 판정 (카메라 규칙과 짝)", () => {
  test.each([
    ["선택 도구 왼쪽", pointer(0), true, true],
    ["선택 도구 ⌥+왼쪽 (회전)", pointer(0, { altKey: true }), true, false],
    ["변형 도구 왼쪽 (회전)", pointer(0), false, false],
    ["변형 도구 Shift+왼쪽", pointer(0, { shiftKey: true }), false, true],
    ["⌃+왼쪽 (팬)", pointer(0, { ctrlKey: true }), true, false],
    ["오른쪽", pointer(2), true, false],
  ])("%s", (_, event, selects, expected) => {
    expect(isBoxSelectDrag(event, { selects, placing: false })).toBe(expected);
  });

  test("배치 중엔 시작하지 않는다", () => {
    expect(
      isBoxSelectDrag(pointer(0, { shiftKey: true }), {
        selects: false,
        placing: true,
      }),
    ).toBe(false);
  });
});
