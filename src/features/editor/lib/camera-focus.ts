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

/** 지금 설정에 맞는 카메라 애니메이션 길이 (모션 줄이기면 0) */
export function defaultCameraDuration(): number {
  return prefersReducedMotion() ? 0 : DURATION_MS;
}

/** 옮길 값. 빠진 값은 그대로 둔다 */
export type CameraPose = {
  target?: Vector3;
  radius?: number;
  alpha?: number;
  beta?: number;
};

/** from에서 to 각도로 가장 짧게 도는 값 (alpha는 계속 돌면 2π를 넘어 쌓인다) */
function nearestAngle(from: number, to: number): number {
  const turn = Math.PI * 2;
  const delta = ((((to - from) % turn) + turn * 1.5) % turn) - Math.PI;
  return from + delta;
}

/**
 * 카메라를 pose로 옮긴다 (짧은 ease-out, duration이 0이면 바로).
 * 새 애니메이션은 진행 중인 것을 멈추고 지금 자리에서 시작한다 (포커스·시점 공용).
 */
export function animateCamera(
  camera: ArcRotateCamera,
  pose: CameraPose,
  duration = defaultCameraDuration(),
) {
  running.get(camera)?.remove();
  running.delete(camera);

  const from = {
    target: camera.target.clone(),
    radius: camera.radius,
    alpha: camera.alpha,
    beta: camera.beta,
  };
  const to = {
    target: pose.target ?? from.target,
    radius: pose.radius ?? from.radius,
    alpha:
      pose.alpha === undefined
        ? from.alpha
        : nearestAngle(from.alpha, pose.alpha),
    beta: pose.beta ?? from.beta,
  };
  // target 세터는 setTarget을 불러 각도·거리를 다시 계산하므로 벡터 값만 바꾼다
  const apply = (k: number) => {
    if (k === 1) {
      // 끝은 정확히 목표값 (보간의 부동소수 오차로 beta 한계를 살짝 넘지 않게)
      camera.target.copyFrom(to.target);
      camera.radius = to.radius;
      camera.alpha = to.alpha;
      camera.beta = to.beta;
      return;
    }
    camera.target.copyFrom(Vector3.Lerp(from.target, to.target, k));
    camera.radius = from.radius + (to.radius - from.radius) * k;
    camera.alpha = from.alpha + (to.alpha - from.alpha) * k;
    camera.beta = from.beta + (to.beta - from.beta) * k;
  };
  if (duration <= 0) {
    apply(1);
    return;
  }

  const scene = camera.getScene();
  const start = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const t = Math.min((performance.now() - start) / duration, 1);
    apply(1 - (1 - t) ** 3);
    if (t === 1) {
      observer.remove();
      running.delete(camera);
    }
  });
  running.set(camera, observer);
}

/**
 * 카메라를 메쉬들로 옮긴다 (방향은 그대로, 회전 중심과 거리만).
 * 거리는 카메라의 줌 한계 안으로 맞춘다. 메쉬가 없으면 false.
 */
export function focusCamera(
  camera: ArcRotateCamera,
  meshes: readonly AbstractMesh[],
  duration = defaultCameraDuration(),
): boolean {
  if (meshes.length === 0) return false;
  const focus = computeFocus(meshes, {
    fov: camera.fov,
    aspect: camera.getScene().getEngine().getAspectRatio(camera),
  });
  const radius = Math.min(
    Math.max(focus.radius, camera.lowerRadiusLimit ?? 0),
    camera.upperRadiusLimit ?? Infinity,
  );
  animateCamera(camera, { target: focus.target, radius }, duration);
  return true;
}
