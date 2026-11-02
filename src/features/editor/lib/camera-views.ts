import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";

import { createListeners } from "@/lib/listeners";

import { animateCamera } from "./camera-focus";

/*
 * 정해진 시점(숫자패드 1/3/7, ⌃로 반대편)과 원근/직교 전환(숫자패드 5) — Blender 방식.
 * 시점은 방향(alpha·beta)만 바꾸고 회전 중심·거리는 둔다. 히스토리에 기록하지 않는다.
 * 직교일 때 보이는 범위는 매 프레임 radius·fov로 맞춘다 → 원근일 때 회전 중심에서 보이던 크기와 같고, 휠 줌도 그대로 동작한다.
 */

export type ViewName = "front" | "back" | "right" | "left" | "top" | "bottom";

/** 카메라 위치 = target + radius·(cosα·sinβ, cosβ, sinα·sinβ). 정면은 -Z 쪽에서 +Z를 본다 */
const VIEW_ANGLES: Record<
  ViewName,
  { alpha: number; beta: number | "top" | "bottom" }
> = {
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2 },
  back: { alpha: Math.PI / 2, beta: Math.PI / 2 },
  right: { alpha: 0, beta: Math.PI / 2 },
  left: { alpha: Math.PI, beta: Math.PI / 2 },
  // 정확히 0·π면 방향이 정해지지 않으므로 카메라의 beta 한계까지만
  top: { alpha: -Math.PI / 2, beta: "top" },
  bottom: { alpha: -Math.PI / 2, beta: "bottom" },
};

export type CameraView = {
  setView(view: ViewName, duration?: number): void;
  isOrthographic(): boolean;
  setOrthographic(enabled: boolean): void;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

/** 직교 범위를 원근의 회전 중심 거리에서 보이는 크기에 맞춘다 */
export function updateOrthoBounds(camera: ArcRotateCamera) {
  const aspect = camera.getScene().getEngine().getAspectRatio(camera);
  const halfHeight = camera.radius * Math.tan(camera.fov / 2);
  camera.orthoTop = halfHeight;
  camera.orthoBottom = -halfHeight;
  camera.orthoLeft = -halfHeight * aspect;
  camera.orthoRight = halfHeight * aspect;
}

export function createCameraView(camera: ArcRotateCamera): CameraView {
  const listeners = createListeners();
  const isOrthographic = () => camera.mode === Camera.ORTHOGRAPHIC_CAMERA;
  const observer = camera.getScene().onBeforeRenderObservable.add(() => {
    if (isOrthographic()) updateOrthoBounds(camera);
  });

  return {
    setView(view, duration) {
      const { alpha, beta } = VIEW_ANGLES[view];
      animateCamera(
        camera,
        {
          alpha,
          beta:
            beta === "top"
              ? (camera.lowerBetaLimit ?? 0.01)
              : beta === "bottom"
                ? (camera.upperBetaLimit ?? Math.PI - 0.01)
                : beta,
        },
        duration,
      );
    },
    isOrthographic,
    setOrthographic(enabled) {
      if (enabled === isOrthographic()) return;
      if (enabled) updateOrthoBounds(camera);
      camera.mode = enabled
        ? Camera.ORTHOGRAPHIC_CAMERA
        : Camera.PERSPECTIVE_CAMERA;
      listeners.emit();
    },
    subscribe: listeners.subscribe,
    dispose() {
      observer.remove();
      listeners.clear();
    },
  };
}
