import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { describe, expect, test, vi } from "vitest";

import type { BoxSelect } from "./box-select";
import { createContextMenu } from "./context-menu";
import type { PlacementTool } from "./placement-tool";
import { bindPointerRouter } from "./pointer-router";
import type { Selection } from "./selection";
import { createTestScene } from "./test-scene";
import { createToolState } from "./tools";
import type { TransformGizmo } from "./transform-gizmo";

/** 탭(클릭)을 흉내 낸다: 렌더링·피킹 없이 커서 아래 메쉬는 stub이 정한다 */
function setup({
  under = null as AbstractMesh | null,
  selected = [] as AbstractMesh[],
  placing = false,
} = {}) {
  const scene = createTestScene();
  const contextMenu = createContextMenu();
  let current = selected;
  const selection = {
    getMeshes: () => current,
    meshAtPointer: () => under,
    select: vi.fn((mesh: AbstractMesh | null) => {
      current = mesh ? [mesh] : [];
    }),
    selectAtPointer: vi.fn(),
  } as unknown as Selection;
  const placement = {
    isActive: () => placing,
    cancel: vi.fn(),
    place: vi.fn(),
  } as unknown as PlacementTool;
  bindPointerRouter(scene, {
    gizmo: { isPointerOver: () => false } as TransformGizmo,
    placement,
    selection,
    tools: createToolState(),
    boxSelect: {} as BoxSelect,
    contextMenu,
  });
  const tap = (button: number) =>
    scene.onPointerObservable.notifyObservers({
      type: PointerEventTypes.POINTERTAP,
      event: { button, clientX: 30, clientY: 40 },
    } as never);
  return { contextMenu, selection, placement, tap, getSelected: () => current };
}

const mesh = (name: string) => ({ name }) as AbstractMesh;

describe("우클릭 메뉴 (pointer-router)", () => {
  test("고르지 않은 객체를 우클릭하면 그것만 고르고 선택 메뉴를 커서 자리에", () => {
    const [a, b] = [mesh("a"), mesh("b")];
    const { contextMenu, tap, getSelected } = setup({
      under: b,
      selected: [a],
    });
    tap(2);
    expect(getSelected()).toEqual([b]);
    expect(contextMenu.getState()).toMatchObject({
      open: true,
      kind: "selection",
      client: { x: 30, y: 40 },
    });
  });

  test("이미 고른 객체를 우클릭하면 여러 개 선택을 그대로 둔다", () => {
    const [a, b] = [mesh("a"), mesh("b")];
    const { selection, tap, getSelected } = setup({
      under: b,
      selected: [a, b],
    });
    tap(2);
    expect(selection.select).not.toHaveBeenCalled();
    expect(getSelected()).toEqual([a, b]);
  });

  test("빈 곳은 씬 메뉴 (선택은 그대로)", () => {
    const a = mesh("a");
    const { contextMenu, tap, getSelected } = setup({ selected: [a] });
    tap(2);
    expect(contextMenu.getState()).toMatchObject({ open: true, kind: "scene" });
    expect(getSelected()).toEqual([a]);
  });

  test("배치 중 우클릭은 메뉴가 아니라 배치 종료", () => {
    const { contextMenu, placement, tap } = setup({ placing: true });
    tap(2);
    expect(placement.cancel).toHaveBeenCalled();
    expect(contextMenu.getState().open).toBe(false);
  });
});
