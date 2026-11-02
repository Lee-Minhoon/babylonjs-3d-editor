// scene.pick 등록
import "@babylonjs/core/Culling/ray";

import type { Camera } from "@babylonjs/core/Cameras/camera";
import { InputManager } from "@babylonjs/core/Inputs/scene.inputManager";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { VertexBuffer } from "@babylonjs/core/Meshes/buffer";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import { isPickableInViewport } from "./mesh-flags";
import { inCreationOrder } from "./mesh-presets";
import type { Selection } from "./selection";

/*
 * 드래그로 박스 선택. 시작 판정은 pointer-router가 camera-controls의 규칙으로 하고, 여기선 사각형과 결과만 다룬다.
 * 좌표는 캔버스 기준 CSS 픽셀 (scene.pointerX/Y와 같음). 화면의 사각형은 React(SelectionBox)가 getRect를 구독해 그린다.
 * 탭과 겹치지 않게 Babylon의 탭 판정 거리(DragMovementThreshold)를 넘게 움직여야 박스가 된다.
 */

export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type BoxSelect = {
  /** 드래그 시작 (아직 박스 아님 — 충분히 움직여야 박스가 된다) */
  begin(x: number, y: number, additive: boolean): void;
  update(x: number, y: number): void;
  /** 끝내고 박스 안 메쉬를 선택한다. 박스가 됐으면 true */
  end(): boolean;
  cancel(): void;
  /** 드래그 중인지 (박스가 되기 전도 포함) */
  isPending(): boolean;
  /** 화면에 그릴 사각형. 박스가 아니면 null */
  getRect(): ScreenRect | null;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

function rectFrom(ax: number, ay: number, bx: number, by: number): ScreenRect {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    right: Math.max(ax, bx),
    bottom: Math.max(ay, by),
  };
}

/** 화면에 투영한 점들 (카메라 뒤 점은 뺀다) */
function projectPoints(
  points: readonly Vector3[],
  transform: Matrix,
  viewport: Viewport,
): Vector3[] {
  return points
    .map((point) =>
      Vector3.Project(point, Matrix.IdentityReadOnly, transform, viewport),
    )
    .filter((point) => point.z >= 0 && point.z <= 1);
}

const insideRect = (point: Vector3, rect: ScreenRect) =>
  point.x >= rect.left &&
  point.x <= rect.right &&
  point.y >= rect.top &&
  point.y <= rect.bottom;

/** 메쉬 정점들의 월드 좌표 */
function worldVertices(mesh: AbstractMesh): Vector3[] {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const world = mesh.getWorldMatrix();
  const vertices: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    vertices.push(
      Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world),
    );
  }
  return vertices;
}

/**
 * 화면 사각형에 걸리는 메쉬 (뷰포트에서 고를 수 있는 것만, 만든 순서).
 *   1. 바운딩 박스 꼭짓점의 화면 범위가 사각형과 안 겹치면 제외 (빠른 거르기)
 *   2. 정점 하나라도 사각형 안이면 선택 — 박스만 보면 구의 모서리 빈 곳에 걸쳐도 골라진다
 *   3. 사각형이 메쉬 면 안쪽에 통째로 들어간 경우(정점이 없음)는 사각형 가운데를 피킹해 확인
 */
export function meshesInRect(
  scene: Scene,
  camera: Camera,
  rect: ScreenRect,
  size: { width: number; height: number },
): AbstractMesh[] {
  const viewport = new Viewport(0, 0, size.width, size.height);
  // getTransformationMatrix는 마지막 렌더 때 값이라 지금 행렬로 다시 만든다
  const transform = camera
    .getViewMatrix()
    .multiply(camera.getProjectionMatrix());
  const center = {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
  return inCreationOrder(scene.meshes)
    .filter(isPickableInViewport)
    .filter((mesh) => {
      mesh.computeWorldMatrix(true);
      const corners = projectPoints(
        mesh.getBoundingInfo().boundingBox.vectorsWorld,
        transform,
        viewport,
      );
      if (corners.length === 0) return false;
      const xs = corners.map((point) => point.x);
      const ys = corners.map((point) => point.y);
      const overlaps =
        Math.min(...xs) <= rect.right &&
        Math.max(...xs) >= rect.left &&
        Math.min(...ys) <= rect.bottom &&
        Math.max(...ys) >= rect.top;
      if (!overlaps) return false;
      if (
        projectPoints(worldVertices(mesh), transform, viewport).some((point) =>
          insideRect(point, rect),
        )
      ) {
        return true;
      }
      return (
        scene.pick(center.x, center.y, (other) => other === mesh, false, camera)
          ?.hit ?? false
      );
    });
}

export function createBoxSelect(scene: Scene, selection: Selection): BoxSelect {
  let drag: { x: number; y: number; additive: boolean } | null = null;
  let rect: ScreenRect | null = null;
  const listeners = createListeners();

  const setRect = (next: ScreenRect | null) => {
    if (next === rect) return;
    rect = next;
    listeners.emit();
  };

  return {
    begin(x, y, additive) {
      drag = { x, y, additive };
      setRect(null);
    },
    update(x, y) {
      if (!drag) return;
      const moved = Math.hypot(x - drag.x, y - drag.y);
      if (rect || moved > InputManager.DragMovementThreshold) {
        setRect(rectFrom(drag.x, drag.y, x, y));
      }
    },
    end() {
      const finished = drag && rect ? { ...drag, rect } : null;
      drag = null;
      setRect(null);
      const camera = scene.activeCamera;
      const area = scene.getEngine().getInputElementClientRect();
      if (!finished || !camera || !area) return false;
      const hits = meshesInRect(scene, camera, finished.rect, area);
      selection.set(
        finished.additive ? [...selection.getMeshes(), ...hits] : hits,
      );
      return true;
    },
    cancel() {
      drag = null;
      setRect(null);
    },
    isPending: () => drag !== null,
    getRect: () => rect,
    subscribe: listeners.subscribe,
    dispose() {
      listeners.clear();
    },
  };
}
