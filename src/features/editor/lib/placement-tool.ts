// scene.createPickingRay / pickWithRay 등록
import "@babylonjs/core/Culling/ray";

import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { History } from "./history";
import { createAddMeshCommand } from "./mesh-commands";
import type { MeshPreset, MeshPresetId } from "./mesh-presets";

/** 이 값 이상으로 위를 향한 면에만 쌓는다 (옆면/아랫면에 맞으면 바닥 평면으로 폴백) */
const TOP_FACE_MIN_NORMAL_Y = 0.7;
const GROUND_PLANE = new Plane(0, 1, 0, 0);

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

/**
 * 프리셋 배치 모드.
 * toggle(preset) → 반투명 미리보기가 커서를 따라다니고, 클릭(탭)할 때마다 그 위치에 메쉬를 만든다.
 * 모드는 Esc·우클릭·같은 프리셋 다시 선택으로 끌 때까지 유지된다.
 * 드래그는 카메라 조작으로 남겨두기 위해 POINTERTAP(거의 움직이지 않은 클릭)만 배치로 처리한다.
 */
export type PlacementTool = {
  /** 배치 모드 시작. 같은 프리셋으로 다시 호출하면 종료(토글). */
  toggle(preset: MeshPreset): void;
  cancel(): void;
  getActivePresetId(): MeshPresetId | null;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

type ActivePlacement = {
  preset: MeshPreset;
  preview: Mesh;
  /** 미리보기가 놓일 표면 위의 점 (restY 적용 전). 커서가 허공이면 null */
  surfacePoint: Vector3 | null;
};

/** 배치는 history를 거쳐 실행되므로 undo/redo 대상이 된다. */
export function createPlacementTool(
  scene: Scene,
  history: History,
): PlacementTool {
  let active: ActivePlacement | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const previewMaterial = new StandardMaterial("__placement-preview", scene);
  previewMaterial.diffuseColor = new Color3(0.45, 0.7, 1);
  previewMaterial.emissiveColor = new Color3(0.1, 0.2, 0.35);
  previewMaterial.alpha = 0.45;

  /** 커서 아래 표면 점: 메쉬 윗면 → 없으면 바닥 평면(y=0) */
  function findSurfacePoint(preview: Mesh): Vector3 | null {
    const ray = scene.createPickingRay(
      scene.pointerX,
      scene.pointerY,
      null,
      scene.activeCamera,
    );

    const hit = scene.pickWithRay(
      ray,
      (mesh) => mesh !== preview && mesh.isPickable && mesh.isEnabled(),
    );
    const normal = hit?.hit ? hit.getNormal(true) : null;
    if (hit?.pickedPoint && normal && normal.y >= TOP_FACE_MIN_NORMAL_Y) {
      return hit.pickedPoint;
    }

    const distance = ray.intersectsPlane(GROUND_PLANE);
    return distance === null
      ? null
      : ray.origin.add(ray.direction.scale(distance));
  }

  function updatePreview() {
    if (!active) return;
    const point = findSurfacePoint(active.preview);
    active.surfacePoint = point;
    active.preview.setEnabled(point !== null);
    if (point) {
      active.preview.position.set(
        point.x,
        point.y + active.preset.restY,
        point.z,
      );
    }
  }

  function start(preset: MeshPreset) {
    stop();
    const preview = preset.create("__placement-preview", scene);
    preview.material = previewMaterial;
    preview.isPickable = false;
    preview.setEnabled(false);
    active = { preset, preview, surfacePoint: null };
    scene.defaultCursor = "crosshair";
    updatePreview();
    emit();
  }

  function stop() {
    if (!active) return;
    active.preview.dispose();
    active = null;
    scene.defaultCursor = "default";
    emit();
  }

  function place() {
    if (!active) return;
    updatePreview();
    if (!active.surfacePoint) return;
    history.execute(
      createAddMeshCommand(scene, active.preset, active.surfacePoint),
    );
    // 방금 놓은 메쉬 위로 미리보기를 다시 올린다
    updatePreview();
  }

  const pointerObserver = scene.onPointerObservable.add((info) => {
    if (!active) return;
    if (info.type === PointerEventTypes.POINTERMOVE) {
      updatePreview();
    } else if (
      info.type === PointerEventTypes.POINTERTAP ||
      // 300ms 안의 두 번째 클릭은 위치와 무관하게 DOUBLETAP으로만 온다 (연속 배치 시 누락 방지)
      info.type === PointerEventTypes.POINTERDOUBLETAP
    ) {
      const event = info.event as PointerEvent;
      if (event.button === LEFT_BUTTON) place();
      else if (event.button === RIGHT_BUTTON) stop();
    }
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (active && event.key === "Escape") stop();
  };
  window.addEventListener("keydown", onKeyDown);

  return {
    toggle(preset) {
      if (active?.preset.id === preset.id) stop();
      else start(preset);
    },
    cancel: stop,
    getActivePresetId: () => active?.preset.id ?? null,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    dispose() {
      stop();
      pointerObserver.remove();
      window.removeEventListener("keydown", onKeyDown);
      previewMaterial.dispose();
      listeners.clear();
    },
  };
}
