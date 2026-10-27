// scene.createPickingRay / pickWithRay 등록
import "@babylonjs/core/Culling/ray";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { createMeshFromSnapshot, type MeshSnapshot } from "./clipboard";
import type { History } from "./history";
import { createAddMeshCommand, createSpawnMeshCommand } from "./mesh-commands";
import { findPreset, type MeshPreset, type MeshPresetId } from "./mesh-presets";
import { snapValue, type ToolState } from "./tools";

/** 이 값 이상으로 위를 향한 면에만 쌓는다 (옆면/아랫면에 맞으면 바닥 평면으로 폴백) */
const TOP_FACE_MIN_NORMAL_Y = 0.7;
const GROUND_PLANE = new Plane(0, 1, 0, 0);

/**
 * 배치 모드. 반투명 미리보기가 커서를 따라다니고, 클릭(탭)한 위치에 메쉬를 만든다.
 *   - 프리셋 배치 (toggle):         클릭할 때마다 계속 배치. Esc·우클릭·같은 프리셋 다시 선택으로 종료.
 *   - 복사본 배치 (startSnapshot):  붙여넣기·복제. 한 번 놓으면 끝나고 onPlaced로 만든 메쉬를 넘긴다.
 * 놓을 때는 history를 거치므로 undo/redo 대상이 된다.
 */
export type SnapshotVerb = "붙여넣기" | "복제";

export type PlacementState =
  | { kind: "preset"; presetId: MeshPresetId }
  | { kind: "snapshot"; verb: SnapshotVerb };

export type PlacementTool = {
  /** 프리셋 배치 시작. 같은 프리셋으로 다시 호출하면 종료(토글). */
  toggle(preset: MeshPreset): void;
  /** 복사본 배치 시작 (한 번 놓으면 종료) */
  startSnapshot(
    snapshot: MeshSnapshot,
    verb: SnapshotVerb,
    onPlaced?: (mesh: AbstractMesh) => void,
  ): void;
  cancel(): void;
  /** 현재 커서 위치에 놓는다 (배치 모드가 아니면 무시) */
  place(): void;
  /** 커서가 움직였을 때 미리보기 위치 갱신 */
  updatePointer(): void;
  isActive(): boolean;
  /** 프리셋 배치 중일 때만 그 id (복사본 배치 중이면 null) */
  getActivePresetId(): MeshPresetId | null;
  /** 배치 상태 (UI 안내용). 배치 중이 아니면 null */
  getState(): PlacementState | null;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

type ActivePlacement = {
  state: PlacementState;
  preview: Mesh;
  /** 표면 점 → 메쉬 중심까지의 높이 (메쉬 밑면이 표면에 닿도록) */
  restOffset: number;
  /** 놓을 위치의 메쉬 중심. 커서가 허공이면 null */
  target: Vector3 | null;
  /** target에 메쉬를 만드는 Command를 실행하고 만든 메쉬를 돌려준다 */
  spawnAt(target: Vector3): AbstractMesh | null;
  /** true면 한 번 놓고 종료 */
  once: boolean;
  onPlaced?: (mesh: AbstractMesh) => void;
};

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
    const snap = tools.getActiveSnap();
    active.target = hit
      ? new Vector3(
          snapValue(hit.x, snap),
          hit.y + active.restOffset,
          snapValue(hit.z, snap),
        )
      : null;
    active.preview.setEnabled(active.target !== null);
    if (active.target) active.preview.position.copyFrom(active.target);
  }

  function createPreview(preset: MeshPreset): Mesh {
    const preview = preset.create("__placement-preview", scene);
    preview.material = previewMaterial;
    preview.isPickable = false;
    preview.setEnabled(false);
    return preview;
  }

  function begin(placement: ActivePlacement) {
    stop();
    active = placement;
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

  function startPreset(preset: MeshPreset) {
    stop();
    begin({
      state: { kind: "preset", presetId: preset.id },
      preview: createPreview(preset),
      restOffset: preset.restY,
      target: null,
      once: false,
      spawnAt(target) {
        // createAddMeshCommand는 표면 점을 받는다 (restY는 내부에서 더함)
        const surface = target.subtract(new Vector3(0, preset.restY, 0));
        const command = createAddMeshCommand(scene, preset, surface);
        history.execute(command);
        return command.getMesh();
      },
    });
  }

  function startSnapshot(
    snapshot: MeshSnapshot,
    verb: SnapshotVerb,
    onPlaced?: (mesh: AbstractMesh) => void,
  ) {
    const preset = findPreset(snapshot.presetId);
    if (!preset) return;
    stop();

    // 미리보기에 원본의 회전·크기를 입히고, 그 상태의 밑면 높이를 잰다
    const preview = createPreview(preset);
    preview.position.setAll(0);
    preview.rotationQuaternion =
      snapshot.transform.rotationQuaternion?.clone() ?? null;
    preview.rotation.copyFrom(snapshot.transform.rotation);
    preview.scaling.copyFrom(snapshot.transform.scaling);
    preview.computeWorldMatrix(true);
    preview.refreshBoundingInfo();
    const restOffset = -preview.getBoundingInfo().boundingBox.minimumWorld.y;

    begin({
      state: { kind: "snapshot", verb },
      preview,
      restOffset,
      target: null,
      once: true,
      onPlaced,
      spawnAt(target) {
        const offset = target.subtract(snapshot.transform.position);
        const command = createSpawnMeshCommand(
          scene,
          () => createMeshFromSnapshot(scene, snapshot, offset),
          verb,
          preset.label,
        );
        history.execute(command);
        return command.getMesh();
      },
    });
  }

  function place() {
    if (!active) return;
    updatePreview();
    if (!active.target) return;
    const placement = active;
    const mesh = placement.spawnAt(placement.target!);
    if (placement.once) stop();
    else updatePreview(); // 방금 놓은 메쉬 위로 미리보기를 다시 올린다
    if (mesh) placement.onPlaced?.(mesh);
  }

  // 포인터 입력은 pointer-router가, Esc는 editor-shortcuts가 이 메서드들을 호출한다
  return {
    toggle(preset) {
      const state = active?.state;
      if (state?.kind === "preset" && state.presetId === preset.id) stop();
      else startPreset(preset);
    },
    startSnapshot,
    cancel: stop,
    place,
    updatePointer: updatePreview,
    isActive: () => active !== null,
    getActivePresetId: () =>
      active?.state.kind === "preset" ? active.state.presetId : null,
    // state 객체는 begin 때 한 번 만들어지므로 useSyncExternalStore 스냅샷으로 안전하다
    getState: () => active?.state ?? null,
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
