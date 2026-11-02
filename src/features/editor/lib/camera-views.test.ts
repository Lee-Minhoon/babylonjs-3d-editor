import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test, vi } from "vitest";

import { createCameraView } from "./camera-views";
import { createTestScene } from "./test-scene";

function setup(alpha = -Math.PI / 4) {
  const scene = createTestScene();
  const camera = new ArcRotateCamera(
    "camera",
    alpha,
    1,
    10,
    new Vector3(1, 0, 2),
    scene,
  );
  return { scene, camera, view: createCameraView(camera) };
}

describe("카메라 시점", () => {
  test("시점은 방향만 바꾸고 회전 중심·거리는 둔다", () => {
    const { camera, view } = setup();
    view.setView("right", 0);
    expect(camera.alpha).toBeCloseTo(0);
    expect(camera.beta).toBeCloseTo(Math.PI / 2);
    expect(camera.radius).toBe(10);
    expect(camera.target.asArray()).toEqual([1, 0, 2]);

    view.setView("front", 0);
    // 정면: 카메라가 회전 중심의 -Z 쪽
    expect(camera.position.z).toBeLessThan(camera.target.z);
    view.setView("top", 0);
    expect(camera.beta).toBe(camera.lowerBetaLimit);
  });

  test("여러 바퀴 돈 카메라도 가장 짧은 쪽으로 돈다", () => {
    const { camera, view } = setup(Math.PI * 6 + 0.1);
    view.setView("front", 0);
    expect(Math.abs(camera.alpha - Math.PI * 6)).toBeLessThanOrEqual(Math.PI);
    expect(Math.cos(camera.alpha)).toBeCloseTo(0);
    expect(Math.sin(camera.alpha)).toBeCloseTo(-1);
  });

  test("직교: 원근의 회전 중심에서 보이던 높이와 같게, 바뀔 때만 알린다", () => {
    const { scene, camera, view } = setup();
    const listener = vi.fn();
    view.subscribe(listener);
    view.setOrthographic(true);
    view.setOrthographic(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(camera.mode).toBe(Camera.ORTHOGRAPHIC_CAMERA);
    expect(camera.orthoTop).toBeCloseTo(10 * Math.tan(camera.fov / 2));

    // 줌(거리 변경)을 따라간다
    camera.radius = 20;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(camera.orthoTop).toBeCloseTo(20 * Math.tan(camera.fov / 2));

    view.setOrthographic(false);
    expect(camera.mode).toBe(Camera.PERSPECTIVE_CAMERA);
    view.dispose();
  });
});
