// scene.createPickingRay / pickWithRay 등록
import "@babylonjs/core/Culling/ray";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { History } from "./history";
import { createAddMeshCommand } from "./mesh-commands";
import type { MeshPreset, MeshPresetId } from "./mesh-presets";
import { snapValue, type ToolState } from "./tools";

/** 이 값 이상으로 위를 향한 면에만 쌓는다 (옆면/아랫면에 맞으면 바닥 평면으로 폴백) */
const TOP_FACE_MIN_NORMAL_Y = 0.7;
const GROUND_PLANE = new Plane(0, 1, 0, 0);

/**
 * 프리셋 배치 모드.
 * toggle(preset) → 반투명 미리보기가 커서를 따라다니고, 클릭(탭)할 때마다 그 위치에 메쉬를 만든다.
 * 모드는 Esc·우클릭·같은 프리셋 다시 선택으로 끌 때까지 유지된다.
 */
export type PlacementTool = {
  /** 배치 모드 시작. 같은 프리셋으로 다시 호출하면 종료(토글). */
  toggle(preset: MeshPreset): void;
  cancel(): void;
  /** 현재 커서 위치에 메쉬를 놓는다 (배치 모드가 아니면 무시) */
  place(): void;
  /** 커서가 움직였을 때 미리보기 위치 갱신 */
  updatePointer(): void;
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
  tools: ToolState,
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
    const hit = findSurfacePoint(active.preview);
    // X/Z만 스냅 (Y는 바닥·윗면 높이 그대로)
    const snap = tools.isSnapEnabled();
    const point = hit
      ? new Vector3(snapValue(hit.x, snap), hit.y, snapValue(hit.z, snap))
      : null;
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

  // 포인터 입력은 pointer-router가, Esc는 editor-shortcuts가 이 메서드들을 호출한다
  return {
    toggle(preset) {
      if (active?.preset.id === preset.id) stop();
      else start(preset);
    },
    cancel: stop,
    place,
    updatePointer: updatePreview,
    getActivePresetId: () => active?.preset.id ?? null,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    dispose() {
      stop();
      previewMaterial.dispose();
      listeners.clear();
    },
  };
}
