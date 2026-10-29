import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test } from "vitest";

import { createHistory, createMacroCommand } from "./history";
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
    const mesh = addPresetMesh(scene, findPreset("box")!, new Vector3(x, 0, 0));
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

  test("select 도구나 배치 중에는 숨긴다", () => {
    const { tools, selection, gizmo, box } = setup();
    selection.select(box(0));
    tools.setTool("select");
    expect(gizmo.getTarget()).toBeNull();
  });
});
