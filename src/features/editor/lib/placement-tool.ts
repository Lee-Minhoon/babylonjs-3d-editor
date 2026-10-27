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
import { createSpawnMeshCommand } from "./mesh-commands";
import {
  addPresetMesh,
  findPreset,
  type MeshPreset,
  type MeshPresetId,
} from "./mesh-presets";
import { snapValue, type ToolState } from "./tools";

/** 이 값 이상으로 위를 향한 면에만 쌓는다 (옆면/아랫면에 맞으면 바닥 평면으로 폴백) */
const TOP_FACE_MIN_NORMAL_Y = 0.7;
const GROUND_PLANE = new Plane(0, 1, 0, 0);
/** R 한 번에 미리보기를 돌리는 각도 (월드 Y축) */
const ROTATE_STEP = Math.PI / 2;

/**
 * 배치 모드. 반투명 미리보기가 커서를 따라다니고, 클릭(탭)한 위치에 메쉬를 만든다.
 *   - 프리셋 배치 (toggle):         클릭할 때마다 계속 배치. Esc·우클릭·같은 프리셋 다시 선택으로 종료.
 *   - 복사본 배치 (startSnapshot):  붙여넣기·복제. 한 번 놓으면 끝나고 onPlaced로 만든 메쉬를 넘긴다.
 * rotate()로 미리보기를 월드 Y축 기준 90°씩 돌린다 (복사본은 원본 회전 위에 더함).
 * 프리셋 배치 중 다른 프리셋으로 바꿔도 돌린 각도는 유지된다.
 * 놓을 때는 history를 거치므로 undo/redo 대상이 된다.
 */
export type SnapshotVerb = "붙여넣기" | "복제";

/** yaw: rotate()로 더한 각도 (도, 0 ~ 359) */
export type PlacementState =
  | { kind: "preset"; presetId: MeshPresetId; yaw: number }
  | { kind: "snapshot"; verb: SnapshotVerb; yaw: number };

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
  /** 미리보기를 월드 Y축으로 90°씩 돌린다 (1: +90°, -1: -90°). 배치 중이 아니면 false */
  rotate(direction: 1 | -1): boolean;
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
  /** 돌리기 전 회전 (오일러, 라디안). 프리셋은 0, 복사본은 원본 회전 */
  baseRotation: Vector3;
  /** rotate()로 돌린 횟수 (ROTATE_STEP 단위, 0 ~ 3) */
  turns: number;
  /** 표면 점 → 메쉬 중심까지의 높이 (메쉬 밑면이 표면에 닿도록). 돌릴 때마다 다시 잰다 */
  restOffset: number;
  /** 놓을 위치의 메쉬 중심. 커서가 허공이면 null */
  target: Vector3 | null;
  /** target에 rotation(오일러)으로 메쉬를 만드는 Command를 실행하고 만든 메쉬를 돌려준다 */
  spawnAt(target: Vector3, rotation: Vector3): AbstractMesh | null;
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

  /** 놓을 회전 = 원래 회전 + 월드 Y축 회전 (Babylon 오일러는 Y가 가장 바깥 = 월드 Y) */
  function getRotation(placement: ActivePlacement): Vector3 {
    return placement.baseRotation.add(
      new Vector3(0, placement.turns * ROTATE_STEP, 0),
    );
  }

  /** 미리보기에 회전을 입히고 그 상태의 밑면 높이를 잰다 */
  function applyRotation(placement: ActivePlacement) {
    const { preview } = placement;
    preview.position.setAll(0);
    preview.rotationQuaternion = null;
    preview.rotation.copyFrom(getRotation(placement));
    preview.computeWorldMatrix(true);
    preview.refreshBoundingInfo();
    placement.restOffset =
      -preview.getBoundingInfo().boundingBox.minimumWorld.y;
  }

  function begin(placement: ActivePlacement) {
    stop();
    active = placement;
    applyRotation(placement);
    scene.defaultCursor = "crosshair";
    updatePreview();
    emit();
  }

  function rotate(direction: 1 | -1): boolean {
    if (!active) return false;
    active.turns = (active.turns + direction + 4) % 4;
    active.state = {
      ...active.state,
      yaw: Math.round((active.turns * ROTATE_STEP * 180) / Math.PI),
    };
    applyRotation(active);
    updatePreview();
    emit();
    return true;
  }

  function stop() {
    if (!active) return;
    active.preview.dispose();
    active = null;
    scene.defaultCursor = "default";
    emit();
  }

  function startPreset(preset: MeshPreset) {
    // 프리셋을 바꿔도 돌려둔 각도는 이어간다
    const previous = active?.state.kind === "preset" ? active : null;
    const turns = previous?.turns ?? 0;
    begin({
      state: {
        kind: "preset",
        presetId: preset.id,
        yaw: previous?.state.yaw ?? 0,
      },
      preview: createPreview(preset),
      baseRotation: Vector3.Zero(),
      turns,
      restOffset: 0,
      target: null,
      once: false,
      spawnAt(target, rotation) {
        const command = createSpawnMeshCommand(
          scene,
          () => {
            const mesh = addPresetMesh(scene, preset, Vector3.Zero());
            mesh.position.copyFrom(target);
            mesh.rotation.copyFrom(rotation);
            return mesh;
          },
          "추가",
          preset.label,
        );
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

    // 미리보기에 원본의 크기를 입힌다 (회전은 begin → applyRotation)
    const preview = createPreview(preset);
    preview.scaling.copyFrom(snapshot.transform.scaling);
    // 회전 기즈모를 쓴 원본은 쿼터니언 → 오일러로 바꿔 Y축 회전을 더할 수 있게 한다
    const baseRotation =
      snapshot.transform.rotationQuaternion?.toEulerAngles() ??
      snapshot.transform.rotation.clone();

    begin({
      state: { kind: "snapshot", verb, yaw: 0 },
      preview,
      baseRotation,
      turns: 0,
      restOffset: 0,
      target: null,
      once: true,
      onPlaced,
      spawnAt(target, rotation) {
        const rotated: MeshSnapshot = {
          ...snapshot,
          transform: {
            ...snapshot.transform,
            rotation,
            rotationQuaternion: null,
          },
        };
        const offset = target.subtract(snapshot.transform.position);
        const command = createSpawnMeshCommand(
          scene,
          () => createMeshFromSnapshot(scene, rotated, offset),
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
    const mesh = placement.spawnAt(placement.target!, getRotation(placement));
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
    rotate,
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
