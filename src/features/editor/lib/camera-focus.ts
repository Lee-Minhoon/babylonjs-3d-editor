import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

/*
 * 선택한 메쉬로 카메라 포커스 (F). 카메라 방향(alpha·beta)은 그대로 두고
 * 회전 중심(target)을 묶음 중심으로, 거리(radius)를 묶음이 화면에 꽉 차게 옮긴다.
 */

/** 화면 가장자리 여유 (1이면 바운딩 구가 화면에 딱 맞는다) */
const MARGIN = 1.6;
/** 아주 작은 메쉬도 너무 들이대지 않게 */
const MIN_RADIUS = 0.25;
const DURATION_MS = 250;

export type CameraFocus = { target: Vector3; radius: number };

/**
 * 메쉬들의 월드 바운딩 박스를 감싸는 구가 시야에 들어오는 카메라 위치.
 * fov는 세로 시야각(라디안), aspect는 가로/세로 — 화면이 좁은 쪽 시야각에 맞춘다.
 */
export function computeFocus(
  meshes: readonly AbstractMesh[],
  { fov, aspect }: { fov: number; aspect: number },
): CameraFocus {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
  }
  const sphereRadius = Math.max(Vector3.Distance(min, max) / 2, MIN_RADIUS);
  const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
  const halfFov = Math.min(fov, horizontalFov) / 2;
  return {
    target: min.add(max).scale(0.5),
    radius: (sphereRadius / Math.sin(halfFov)) * MARGIN,
  };
}

const running = new WeakMap<ArcRotateCamera, Observer<Scene>>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 카메라를 메쉬들로 옮긴다 (짧은 ease-out 애니메이션, 모션 줄이기 설정이면 바로).
 * 거리는 카메라의 줌 한계 안으로 맞춘다. 메쉬가 없으면 false.
 */
export function focusCamera(
  camera: ArcRotateCamera,
  meshes: readonly AbstractMesh[],
  duration = prefersReducedMotion() ? 0 : DURATION_MS,
): boolean {
  if (meshes.length === 0) return false;
  const scene = camera.getScene();
  const focus = computeFocus(meshes, {
    fov: camera.fov,
    aspect: scene.getEngine().getAspectRatio(camera),
  });
  const toRadius = Math.min(
    Math.max(focus.radius, camera.lowerRadiusLimit ?? 0),
    camera.upperRadiusLimit ?? Infinity,
  );

  running.get(camera)?.remove();
  running.delete(camera);
  // target 세터는 setTarget을 불러 각도·거리를 다시 계산하므로 벡터 값만 바꾼다
  const apply = (target: Vector3, radius: number) => {
    camera.target.copyFrom(target);
    camera.radius = radius;
  };
  if (duration <= 0) {
    apply(focus.target, toRadius);
    return true;
  }

  const fromTarget = camera.target.clone();
  const fromRadius = camera.radius;
  const start = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const t = Math.min((performance.now() - start) / duration, 1);
    const k = 1 - (1 - t) ** 3;
    apply(
      Vector3.Lerp(fromTarget, focus.target, k),
      fromRadius + (toRadius - fromRadius) * k,
    );
    if (t === 1) {
      observer.remove();
      running.delete(camera);
    }
  });
  running.set(camera, observer);
  return true;
}
