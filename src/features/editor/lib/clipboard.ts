import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import { getMaterialValues, type MaterialValues } from "./mesh-material";
import {
  addPresetMesh,
  findPreset,
  getPresetId,
  type MeshPresetId,
} from "./mesh-presets";
import {
  applyTransform,
  captureTransform,
  type TransformSnapshot,
} from "./transform-command";

/**
 * 메쉬를 다시 만들 수 있는 데이터. 메쉬 객체가 아니라 데이터를 담아서
 * 잘라낸 원본이 나중에 완전히 해제돼도 붙여넣을 수 있다.
 */
export type MeshSnapshot = {
  presetId: MeshPresetId;
  transform: TransformSnapshot;
  /** null이면 새 메쉬처럼 랜덤 값 */
  material: MaterialValues | null;
};

export function captureMeshSnapshot(mesh: AbstractMesh): MeshSnapshot | null {
  const presetId = getPresetId(mesh);
  if (!presetId) return null;
  return {
    presetId,
    transform: captureTransform(mesh),
    material: getMaterialValues(mesh),
  };
}

/** 스냅샷으로 새 메쉬를 만들고 offset만큼 옮긴다. 이름은 새로 붙는다 ("Box 4" …). */
export function createMeshFromSnapshot(
  scene: Scene,
  snapshot: MeshSnapshot,
  offset: Vector3,
): Mesh {
  const preset = findPreset(snapshot.presetId);
  if (!preset) throw new Error(`Unknown preset: ${snapshot.presetId}`);
  const mesh = addPresetMesh(
    scene,
    preset,
    Vector3.Zero(),
    snapshot.material ?? undefined,
  );
  applyTransform(mesh, snapshot.transform);
  mesh.position.addInPlace(offset);
  return mesh;
}

/** 에디터 메쉬들의 스냅샷 (에디터 메쉬가 아닌 것은 건너뛴다) */
export function captureMeshSnapshots(
  meshes: readonly AbstractMesh[],
): MeshSnapshot[] {
  return meshes.flatMap((mesh) => captureMeshSnapshot(mesh) ?? []);
}

/**
 * 에디터 내부 클립보드 (시스템 클립보드는 쓰지 않는다). 여러 메쉬를 한 번에 담는다.
 * 붙여넣을 위치는 배치 모드에서 사용자가 고른다 (placement.startSnapshot).
 */
export type Clipboard = {
  /** 복사할 에디터 메쉬가 하나도 없으면 false (클립보드는 그대로) */
  copy(meshes: readonly AbstractMesh[]): boolean;
  get(): readonly MeshSnapshot[] | null;
  hasContent(): boolean;
  subscribe(onChange: () => void): () => void;
};

export function createClipboard(): Clipboard {
  let snapshots: readonly MeshSnapshot[] | null = null;
  const listeners = createListeners();

  return {
    copy(meshes) {
      const next = captureMeshSnapshots(meshes);
      if (next.length === 0) return false;
      snapshots = next;
      listeners.emit();
      return true;
    },
    get: () => snapshots,
    hasContent: () => snapshots !== null,
    subscribe: listeners.subscribe,
  };
}
