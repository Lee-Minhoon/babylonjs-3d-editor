// scene.createPickingRay / pickWithRay 등록
import "@babylonjs/core/Culling/ray";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import { createMeshFromSnapshot, type MeshSnapshot } from "./clipboard";
import { createMacroCommand, type History, macroLabel } from "./history";
import { createSpawnMeshCommand, type SpawnMeshCommand } from "./mesh-commands";
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
 *   - 복사본 배치 (startSnapshot):  붙여넣기·복제. 여러 메쉬면 서로의 위치 관계를 유지한 묶음으로 놓는다.
 *                                   한 번 놓으면 끝나고 onPlaced로 만든 메쉬들을 넘긴다.
 * 미리보기는 "기준점(anchor) + 항목별 오프셋"으로 배치한다. 기준점은 커서가 가리키는 표면 점이고
 * (X/Z 스냅), 묶음의 밑면이 그 표면에 닿는다. 가로 기준은 첫 메쉬라 원본이 격자 위면 복사본도 격자 위다.
 * rotate()는 묶음 전체를 기준점 둘레로 월드 Y축 90°씩 돌린다 (복사본은 원본 회전 위에 더함).
 * 프리셋 배치 중 다른 프리셋으로 바꿔도 돌린 각도는 유지된다.
 * 놓을 때는 history를 거치므로 undo/redo 대상이 된다 (여러 개면 Command 하나로 묶음).
 */
export type SnapshotVerb = "붙여넣기" | "복제";

/** yaw: rotate()로 더한 각도 (도, 0 ~ 359). count: 한 번에 놓는 메쉬 수 */
export type PlacementState =
  | { kind: "preset"; presetId: MeshPresetId; yaw: number }
  | { kind: "snapshot"; verb: SnapshotVerb; yaw: number; count: number };

export type PlacementTool = {
  /** 프리셋 배치 시작. 같은 프리셋으로 다시 호출하면 종료(토글). */
  toggle(preset: MeshPreset): void;
  /** 복사본 배치 시작 (한 번 놓으면 종료) */
  startSnapshot(
    snapshots: readonly MeshSnapshot[],
    verb: SnapshotVerb,
    onPlaced?: (meshes: AbstractMesh[]) => void,
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

/** 묶음의 한 항목 */
type PlacementItem = {
  preview: Mesh;
  /** 돌리기 전 회전 (오일러, 라디안). 프리셋은 0, 복사본은 원본 회전 */
  baseRotation: Vector3;
  /** 돌리기 전, 기준점 → 메쉬 중심 */
  offset: Vector3;
  /** 이 위치·회전으로 메쉬를 만드는 Command (아직 실행 전) */
  createCommand(position: Vector3, rotation: Vector3): SpawnMeshCommand;
};

type ActivePlacement = {
  state: PlacementState;
  items: PlacementItem[];
  /** rotate()로 돌린 횟수 (ROTATE_STEP 단위, 0 ~ 3) */
  turns: number;
  /** 놓을 기준점 (표면 위, X/Z 스냅). 커서가 허공이면 null */
  anchor: Vector3 | null;
  /** 여러 개를 놓을 때 히스토리 라벨 동사 */
  verb: string;
  /** true면 한 번 놓고 종료 */
  once: boolean;
  onPlaced?: (meshes: AbstractMesh[]) => void;
};

export function createPlacementTool(
  scene: Scene,
  history: History,
  tools: ToolState,
): PlacementTool {
  let active: ActivePlacement | null = null;
  const listeners = createListeners();
  const emit = listeners.emit;

  const previewMaterial = new StandardMaterial("__placement-preview", scene);
  previewMaterial.diffuseColor = new Color3(0.45, 0.7, 1);
  previewMaterial.emissiveColor = new Color3(0.1, 0.2, 0.35);
  previewMaterial.alpha = 0.45;

  /** 커서 아래 표면 점: 메쉬 윗면 → 없으면 바닥 평면(y=0). 미리보기는 pickable이 아니라 맞지 않는다 */
  function findSurfacePoint(): Vector3 | null {
    const ray = scene.createPickingRay(
      scene.pointerX,
      scene.pointerY,
      null,
      scene.activeCamera,
    );

    const hit = scene.pickWithRay(
      ray,
      (mesh) => mesh.isPickable && mesh.isEnabled(),
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

  /** 항목의 놓일 위치·회전 (돌린 각도 반영) */
  function getPose(placement: ActivePlacement, item: PlacementItem) {
    const yaw = placement.turns * ROTATE_STEP;
    return {
      // Babylon 오일러는 Y가 가장 바깥 = 월드 Y → y에 더하면 월드 Y축 회전
      rotation: item.baseRotation.add(new Vector3(0, yaw, 0)),
      offset: Vector3.TransformCoordinates(item.offset, Matrix.RotationY(yaw)),
    };
  }

  function updatePreview() {
    if (!active) return;
    const hit = findSurfacePoint();
    // X/Z만 스냅 (Y는 바닥·윗면 높이 그대로)
    const snap = tools.getActiveSnap();
    active.anchor = hit
      ? new Vector3(snapValue(hit.x, snap), hit.y, snapValue(hit.z, snap))
      : null;
    for (const item of active.items) {
      item.preview.setEnabled(active.anchor !== null);
      if (!active.anchor) continue;
      const { rotation, offset } = getPose(active, item);
      item.preview.rotationQuaternion = null;
      item.preview.rotation.copyFrom(rotation);
      item.preview.position.copyFrom(active.anchor.add(offset));
    }
  }

  function createPreview(preset: MeshPreset): Mesh {
    const preview = preset.create("__placement-preview", scene);
    preview.material = previewMaterial;
    preview.isPickable = false;
    preview.setEnabled(false);
    return preview;
  }

  /**
   * 묶음의 오프셋을 정한다: 각 미리보기를 (돌리기 전) 원래 자리에 두고 전체 밑면 높이를 잰 뒤,
   * 기준점 = (첫 항목 X, 묶음 밑면 Y, 첫 항목 Z) 에서 각 메쉬 중심까지.
   * Y축 회전은 높이를 바꾸지 않으므로 돌릴 때 다시 잴 필요가 없다.
   */
  function layoutItems(
    entries: { preview: Mesh; position: Vector3; baseRotation: Vector3 }[],
  ) {
    let bottom = Infinity;
    for (const { preview, position, baseRotation } of entries) {
      preview.position.copyFrom(position);
      preview.rotationQuaternion = null;
      preview.rotation.copyFrom(baseRotation);
      preview.computeWorldMatrix(true);
      preview.refreshBoundingInfo();
      bottom = Math.min(
        bottom,
        preview.getBoundingInfo().boundingBox.minimumWorld.y,
      );
    }
    const first = entries[0].position;
    const anchor = new Vector3(first.x, bottom, first.z);
    return entries.map(({ position }) => position.subtract(anchor));
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
    for (const item of active.items) item.preview.dispose();
    active = null;
    scene.defaultCursor = "default";
    emit();
  }

  function rotate(direction: 1 | -1): boolean {
    if (!active) return false;
    active.turns = (active.turns + direction + 4) % 4;
    active.state = {
      ...active.state,
      yaw: Math.round((active.turns * ROTATE_STEP * 180) / Math.PI),
    };
    updatePreview();
    emit();
    return true;
  }

  function startPreset(preset: MeshPreset) {
    // 프리셋을 바꿔도 돌려둔 각도는 이어간다
    const previous = active?.state.kind === "preset" ? active : null;
    const preview = createPreview(preset);
    const [offset] = layoutItems([
      { preview, position: Vector3.Zero(), baseRotation: Vector3.Zero() },
    ]);
    begin({
      state: {
        kind: "preset",
        presetId: preset.id,
        yaw: previous?.state.yaw ?? 0,
      },
      items: [
        {
          preview,
          baseRotation: Vector3.Zero(),
          offset,
          createCommand: (position, rotation) =>
            createSpawnMeshCommand(
              scene,
              () => {
                const mesh = addPresetMesh(scene, preset);
                mesh.position.copyFrom(position);
                mesh.rotation.copyFrom(rotation);
                return mesh;
              },
              "추가",
              preset.label,
            ),
        },
      ],
      turns: previous?.turns ?? 0,
      anchor: null,
      verb: "추가",
      once: false,
    });
  }

  function startSnapshot(
    snapshots: readonly MeshSnapshot[],
    verb: SnapshotVerb,
    onPlaced?: (meshes: AbstractMesh[]) => void,
  ) {
    const entries = snapshots.flatMap((snapshot) => {
      const preset = findPreset(snapshot.presetId);
      if (!preset) return [];
      const preview = createPreview(preset);
      // 미리보기에 원본의 크기를 입힌다 (회전은 layoutItems·updatePreview)
      preview.scaling.copyFrom(snapshot.transform.scaling);
      return [
        {
          snapshot,
          preset,
          preview,
          position: snapshot.transform.position.clone(),
          // 회전 기즈모를 쓴 원본은 쿼터니언 → 오일러로 바꿔 Y축 회전을 더할 수 있게 한다
          baseRotation:
            snapshot.transform.rotationQuaternion?.toEulerAngles() ??
            snapshot.transform.rotation.clone(),
        },
      ];
    });
    if (entries.length === 0) return;
    const offsets = layoutItems(entries);

    begin({
      state: { kind: "snapshot", verb, yaw: 0, count: entries.length },
      items: entries.map(({ snapshot, preset, preview, baseRotation }, i) => ({
        preview,
        baseRotation,
        offset: offsets[i],
        createCommand(position, rotation) {
          const placed: MeshSnapshot = {
            ...snapshot,
            transform: {
              ...snapshot.transform,
              rotation,
              rotationQuaternion: null,
            },
          };
          const shift = position.subtract(snapshot.transform.position);
          return createSpawnMeshCommand(
            scene,
            () => createMeshFromSnapshot(scene, placed, shift),
            verb,
            preset.label,
          );
        },
      })),
      turns: 0,
      anchor: null,
      verb,
      once: true,
      onPlaced,
    });
  }

  function place() {
    if (!active) return;
    updatePreview();
    const placement = active;
    const anchor = placement.anchor;
    if (!anchor) return;

    const commands = placement.items.map((item) => {
      const { rotation, offset } = getPose(placement, item);
      return item.createCommand(anchor.add(offset), rotation);
    });
    history.execute(
      createMacroCommand(macroLabel(commands, placement.verb), commands),
    );
    const meshes = commands.flatMap((command) => command.getMesh() ?? []);

    if (placement.once) stop();
    else updatePreview(); // 방금 놓은 메쉬 위로 미리보기를 다시 올린다
    placement.onPlaced?.(meshes);
  }

  // 포인터 입력은 pointer-router가, Esc·R은 editor-shortcuts가 이 메서드들을 호출한다
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
    // state 객체는 begin·rotate 때만 새로 만들어지므로 useSyncExternalStore 스냅샷으로 안전하다
    getState: () => active?.state ?? null,
    subscribe: listeners.subscribe,
    dispose() {
      stop();
      previewMaterial.dispose();
      listeners.clear();
    },
  };
}
