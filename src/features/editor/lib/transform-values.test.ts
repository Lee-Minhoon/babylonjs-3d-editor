import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test } from "vitest";

import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";
import { getTransformValues, setTransformAxis } from "./transform-values";

const scene = createTestScene();
const box = () => addPresetMesh(scene, findPreset("box")!);

describe("getTransformValues", () => {
  test("회전은 도 단위, 부동소수 잔여값은 0으로", () => {
    const mesh = box();
    mesh.position.set(1, -0, 1e-12);
    mesh.rotation.set(Math.PI / 2, 0, 0);
    expect(getTransformValues(mesh)).toEqual({
      position: [1, 0, 0],
      rotation: [90, 0, 0],
      scaling: [1, 1, 1],
    });
  });

  test("쿼터니언 회전도 도 단위 오일러로 읽는다", () => {
    const mesh = box();
    mesh.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI / 4, 0);
    expect(getTransformValues(mesh).rotation[1]).toBeCloseTo(45);
  });
});

describe("setTransformAxis", () => {
  test("위치·크기는 그 축만 바꾼다", () => {
    const mesh = box();
    mesh.position.set(1, 2, 3);
    setTransformAxis(mesh, "position", 1, 9);
    expect(mesh.position.asArray()).toEqual([1, 9, 3]);
    setTransformAxis(mesh, "scaling", 2, 0.5);
    expect(mesh.scaling.asArray()).toEqual([1, 1, 0.5]);
  });

  test("회전은 도로 받아 라디안으로 넣고, 원래 표현(오일러/쿼터니언)을 유지한다", () => {
    const euler = box();
    setTransformAxis(euler, "rotation", 0, 180);
    expect(euler.rotationQuaternion).toBeNull();
    expect(euler.rotation.x).toBeCloseTo(Math.PI);

    const quaternion = box();
    quaternion.rotationQuaternion = Quaternion.Identity();
    setTransformAxis(quaternion, "rotation", 1, 90);
    expect(quaternion.rotationQuaternion).not.toBeNull();
    expect(getTransformValues(quaternion).rotation[1]).toBeCloseTo(90);
  });
});
