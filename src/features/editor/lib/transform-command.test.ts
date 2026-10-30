import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { describe, expect, test } from "vitest";

import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";
import {
  applyTransform,
  captureTransform,
  isSameTransform,
} from "./transform-command";

const scene = createTestScene();

function box(rotation: Vector3) {
  const mesh = addPresetMesh(scene, findPreset("box")!);
  mesh.position.set(2, 0.5, 1);
  mesh.rotation.copyFrom(rotation);
  mesh.scaling.set(1, 2, 1);
  mesh.computeWorldMatrix(true);
  return mesh;
}

describe("isSameTransform", () => {
  test.each([
    ["Y 90°", new Vector3(0, Math.PI / 2, 0)],
    ["임의 각", new Vector3(0.3, 1.1, -0.4)],
    ["X 180° (오일러가 (0,180,180)으로 돌아온다)", new Vector3(Math.PI, 0, 0)],
  ])(
    "setParent 왕복(여러 개 선택 드래그) 뒤에도 같은 변형이다: %s",
    (_, rotation) => {
      const mesh = box(rotation);
      const pivot = new TransformNode("pivot", scene);
      pivot.position.set(1.3, 0.5, -2.7);
      const before = captureTransform(mesh);
      mesh.setParent(pivot);
      mesh.setParent(null);
      expect(isSameTransform(before, captureTransform(mesh))).toBe(true);
    },
  );

  test("오일러와 쿼터니언 표현이 달라도 같은 자세면 같다", () => {
    const mesh = box(new Vector3(0, Math.PI / 2, 0));
    const before = captureTransform(mesh);
    mesh.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI / 2, 0);
    expect(isSameTransform(before, captureTransform(mesh))).toBe(true);
  });

  test("실제로 움직였으면 다르다", () => {
    const mesh = box(Vector3.Zero());
    const before = captureTransform(mesh);
    mesh.position.x += 0.01;
    expect(isSameTransform(before, captureTransform(mesh))).toBe(false);
    applyTransform(mesh, before);
    mesh.rotation.y += 0.01;
    expect(isSameTransform(before, captureTransform(mesh))).toBe(false);
  });
});

describe("captureTransform", () => {
  test("피벗의 자식인 동안(드래그 중)에도 월드 기준 값을 담는다", () => {
    const mesh = box(new Vector3(0, Math.PI / 2, 0));
    const pivot = new TransformNode("pivot", scene);
    pivot.position.set(1, 0, 1);
    mesh.setParent(pivot);
    pivot.position.x += 5; // 드래그로 피벗이 움직임
    const snapshot = captureTransform(mesh);
    expect(snapshot.position.asArray().map((n) => +n.toFixed(5))).toEqual([
      7, 0.5, 1,
    ]);
    expect(snapshot.rotationQuaternion).toBeNull();
    expect(snapshot.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(snapshot.scaling.asArray().map((n) => +n.toFixed(5))).toEqual([
      1, 2, 1,
    ]);
  });
});
