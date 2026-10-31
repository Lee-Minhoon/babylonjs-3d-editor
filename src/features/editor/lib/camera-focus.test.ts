import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test } from "vitest";

import { computeFocus, focusCamera } from "./camera-focus";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const box = (x: number, size = 1) => {
  const mesh = addPresetMesh(scene, findPreset("box")!);
  mesh.position.set(x, size / 2, 0);
  mesh.scaling.setAll(size);
  return mesh;
};

describe("computeFocus", () => {
  test("묶음 바운딩 박스 중심을 보고, 클수록 멀어진다", () => {
    const view = { fov: 0.8, aspect: 1 };
    const small = computeFocus([box(0)], view);
    const pair = computeFocus([box(-5), box(5)], view);
    expect(small.target.asArray()).toEqual([0, 0.5, 0]);
    expect(pair.target.x).toBeCloseTo(0);
    expect(pair.radius).toBeGreaterThan(small.radius * 5);
  });

  test("화면이 세로로 길면 좁은 가로 시야에 맞춰 더 멀어진다", () => {
    const mesh = box(0);
    const wide = computeFocus([mesh], { fov: 0.8, aspect: 2 });
    const tall = computeFocus([mesh], { fov: 0.8, aspect: 0.5 });
    expect(tall.radius).toBeGreaterThan(wide.radius);
  });
});

describe("focusCamera", () => {
  const camera = () => {
    const camera = new ArcRotateCamera("c", 1, 1, 10, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 120;
    return camera;
  };

  test("방향(alpha·beta)은 그대로 두고 중심과 거리만 바꾼다", () => {
    const cam = camera();
    expect(focusCamera(cam, [box(8, 4)], 0)).toBe(true);
    expect(cam.target.x).toBeCloseTo(8);
    expect(cam.target.y).toBeCloseTo(2);
    expect([cam.alpha, cam.beta]).toEqual([1, 1]);
    expect(cam.radius).toBeGreaterThan(4);
  });

  test("거리는 줌 한계 안으로 맞추고, 메쉬가 없으면 아무것도 하지 않는다", () => {
    const cam = camera();
    focusCamera(cam, [box(0, 0.01)], 0);
    expect(cam.radius).toBe(2);
    expect(focusCamera(cam, [], 0)).toBe(false);
  });
});
