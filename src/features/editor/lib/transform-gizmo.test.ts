import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { describe, expect, test, vi } from "vitest";

import { addPresetObject } from "./editor-lights";
import { createHistory, createMacroCommand } from "./history";
import { createParentCommand, getEditorParent } from "./mesh-hierarchy";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createPlacementTool } from "./placement-tool";
import { createSelection } from "./selection";
import { createTestScene } from "./test-scene";
import { createToolState } from "./tools";
import { captureTransform, createTransformCommand } from "./transform-command";
import { createTransformGizmo } from "./transform-gizmo";

function setup() {
  const scene = createTestScene();
  const history = createHistory();
  const tools = createToolState();
  const selection = createSelection(scene);
  const placement = createPlacementTool(scene, history, tools);
  const gizmo = createTransformGizmo(scene, {
    history,
    selection,
    tools,
    placement,
  });
  const box = (x: number) => {
    const mesh = addPresetMesh(scene, findPreset("box")!);
    mesh.position.set(x, 0.5, 0);
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  return { scene, history, tools, selection, gizmo, box };
}

/** 메쉬들을 x로 dx만큼 옮기는 Command 하나 (기즈모 드래그를 흉내) */
function moveCommand(
  meshes: import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh[],
  dx: number,
) {
  return createMacroCommand(
    "이동",
    meshes.map((mesh) => {
      const before = captureTransform(mesh);
      const after = captureTransform(mesh);
      after.position.x += dx;
      return createTransformCommand(mesh, "이동", before, after);
    }),
  );
}

describe("transform gizmo", () => {
  test("하나면 그 메쉬에, 여러 개면 묶음 중심 피벗에 붙는다", () => {
    const { selection, gizmo, box } = setup();
    const [a, b] = [box(0), box(4)];
    selection.select(a);
    expect(gizmo.getTarget()).toBe(a);

    selection.set([a, b]);
    expect(gizmo.getTarget()?.position.x).toBeCloseTo(2);
  });

  test("여러 개 선택 피벗은 undo/redo로 메쉬가 움직여도 따라간다", () => {
    const { history, selection, gizmo, box } = setup();
    const [a, b] = [box(0), box(4)];
    selection.set([a, b]);

    history.execute(moveCommand([a, b], 10));
    expect(gizmo.getTarget()?.position.x).toBeCloseTo(12);
    history.undo();
    expect(gizmo.getTarget()?.position.x).toBeCloseTo(2);
    history.redo();
    expect(gizmo.getTarget()?.position.x).toBeCloseTo(12);
  });

  test("크기 도구에서는 조명 아이콘에 붙지 않는다 (조명은 크기가 없다 — 속성 패널과 같게)", () => {
    const { scene, tools, selection, gizmo, box } = setup();
    const light = addPresetObject(scene, findPreset("point-light")!);
    const mesh = box(0);
    tools.setTool("scale");
    selection.select(light);
    expect(gizmo.getTarget()).toBeNull();
    selection.set([light, mesh]);
    expect(gizmo.getTarget()).toBe(mesh);

    tools.setTool("move");
    selection.select(light);
    expect(gizmo.getTarget()).toBe(light);
  });

  test("select 도구나 배치 중에는 숨긴다", () => {
    const { tools, selection, gizmo, box } = setup();
    selection.select(box(0));
    tools.setTool("select");
    expect(gizmo.getTarget()).toBeNull();
  });

  test("여러 개 선택 피벗 축: 로컬이면 처음 고른 메쉬 회전, 월드면 회전 없음", () => {
    const { tools, selection, gizmo, box } = setup();
    const [a, b] = [box(0), box(4)];
    a.rotation.y = Math.PI / 2;
    selection.set([a, b]);
    const yaw = () =>
      gizmo.getTarget()?.rotationQuaternion?.toEulerAngles().y ?? 0;
    expect(yaw()).toBeCloseTo(Math.PI / 2);

    tools.setGizmoSpace("world");
    expect(yaw()).toBeCloseTo(0);
  });

  test("여러 개 드래그: 피벗을 따라 움직이고 Command 하나, 자식은 부모 기준 값으로, 부모와 함께면 한 번만", () => {
    // 기즈모 매니저를 잡아 드래그 시작/끝을 흉내 낸다 (포인터 없이)
    const spy = vi.spyOn(GizmoManager.prototype, "attachToNode");
    const { history, tools, selection, gizmo, box } = setup();
    const parent = box(10);
    parent.rotation.y = Math.PI / 2;
    const child = box(0);
    createParentCommand(child, parent)!.execute();
    const loner = box(4);
    const grandchild = box(0);
    createParentCommand(grandchild, child)!.execute();

    tools.setTool("move");
    selection.set([child, grandchild, loner]);
    const manager = spy.mock.contexts.at(-1) as GizmoManager;
    const positionGizmo = manager.gizmos.positionGizmo!;
    const pivot = gizmo.getTarget()!;
    const world = (mesh: AbstractMesh) =>
      mesh.computeWorldMatrix(true).getTranslation().x;
    const before = [child, grandchild, loner].map(world);
    const childLocal = child.position.clone();

    positionGizmo.onDragStartObservable.notifyObservers({} as never);
    pivot.position.x += 2;
    positionGizmo.onDragEndObservable.notifyObservers({} as never);

    expect([child, grandchild, loner].map(world)).toEqual(
      before.map((x) => expect.closeTo(x + 2, 5)),
    );
    // 부모가 Y로 90° 돌아 있어 월드 X 이동이 부모 기준으로는 Z
    expect(child.position.z).toBeCloseTo(childLocal.z + 2);
    expect(getEditorParent(child)).toBe(parent);
    expect(history.getState().undoLabel).toBe("메쉬 2개 이동");

    history.undo();
    expect([child, grandchild, loner].map(world)).toEqual(
      before.map((x) => expect.closeTo(x, 5)),
    );
    spy.mockRestore();
  });
});
