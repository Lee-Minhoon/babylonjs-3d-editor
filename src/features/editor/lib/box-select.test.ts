import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { InputManager } from "@babylonjs/core/Inputs/scene.inputManager";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test } from "vitest";

import { createBoxSelect, meshesInRect } from "./box-select";
import { setMeshFlag } from "./mesh-flags";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createSelection } from "./selection";
import { createTestScene } from "./test-scene";

/** 정면(-Z 쪽)에서 보는 카메라와 왼쪽·오른쪽 박스 */
function setup() {
  const scene = createTestScene();
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    Math.PI / 2,
    10,
    Vector3.Zero(),
    scene,
  );
  const box = (x: number) => {
    const mesh = addPresetMesh(scene, findPreset("box")!);
    mesh.position.x = x;
    return mesh;
  };
  const engine = scene.getEngine();
  const size = {
    width: engine.getRenderWidth(),
    height: engine.getRenderHeight(),
  };
  return { scene, camera, left: box(-2), right: box(2), size };
}

describe("meshesInRect", () => {
  test("사각형과 겹치는 메쉬만, 만든 순서로", () => {
    const { scene, camera, left, right, size } = setup();
    const { width, height } = size;
    const all = { left: 0, top: 0, right: width, bottom: height };
    expect(meshesInRect(scene, camera, all, size)).toEqual([left, right]);
    const leftHalf = { ...all, right: width / 2 - 1 };
    expect(meshesInRect(scene, camera, leftHalf, size)).toEqual([left]);
    const corner = { left: 0, top: 0, right: 5, bottom: 5 };
    expect(meshesInRect(scene, camera, corner, size)).toEqual([]);
  });

  test("바운딩 박스 모서리의 빈 곳은 걸리지 않고, 면 안쪽에 통째로 들어간 사각형은 걸린다", () => {
    const { scene, camera, size } = setup();
    const sphere = addPresetMesh(scene, findPreset("sphere")!);
    sphere.position.set(0, 0, -3); // 박스들보다 앞, 화면 가운데
    sphere.scaling.setAll(2);
    const { width, height } = size;
    // 구의 화면 반지름 대략: 1 / (거리 7 · tan(fov/2)) · (높이/2)
    const r = (height / 2) * (1 / (7 * Math.tan(camera.fov / 2)));
    const cx = width / 2;
    const cy = height / 2;
    // 바운딩 사각형의 왼쪽 위 모서리 근처 (구 바깥)
    const cornerGap = {
      left: cx - r,
      top: cy - r,
      right: cx - r * 0.8,
      bottom: cy - r * 0.8,
    };
    expect(meshesInRect(scene, camera, cornerGap, size)).not.toContain(sphere);
    // 구 면 한가운데의 작은 사각형 (정점이 안에 없을 수 있다)
    const inner = { left: cx - 1, top: cy - 1, right: cx + 1, bottom: cy + 1 };
    expect(meshesInRect(scene, camera, inner, size)).toContain(sphere);
  });

  test("숨기거나 잠근 메쉬는 고르지 않는다", () => {
    const { scene, camera, left, right, size } = setup();
    setMeshFlag(left, "hidden", true);
    setMeshFlag(right, "locked", true);
    const all = { left: 0, top: 0, right: size.width, bottom: size.height };
    expect(meshesInRect(scene, camera, all, size)).toEqual([]);
  });
});

describe("createBoxSelect", () => {
  test("탭 판정 거리를 넘게 움직여야 박스가 된다", () => {
    const { scene } = setup();
    const box = createBoxSelect(scene, createSelection(scene));
    const near = InputManager.DragMovementThreshold;
    box.begin(10, 10, false);
    expect(box.isPending()).toBe(true);
    box.update(10 + near, 10);
    expect(box.getRect()).toBeNull();
    box.update(10 + near + 5, 30);
    expect(box.getRect()).toEqual({
      left: 10,
      top: 10,
      right: 10 + near + 5,
      bottom: 30,
    });
    box.cancel();
    expect(box.isPending()).toBe(false);
    expect(box.getRect()).toBeNull();
  });
});
