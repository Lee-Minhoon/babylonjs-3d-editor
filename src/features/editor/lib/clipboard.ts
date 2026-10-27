import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

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
  color: Color3 | null;
};

export function captureMeshSnapshot(mesh: AbstractMesh): MeshSnapshot | null {
  const presetId = getPresetId(mesh);
  if (!presetId) return null;
  const material = mesh.material;
  return {
    presetId,
    transform: captureTransform(mesh),
    color:
      material instanceof StandardMaterial
        ? material.diffuseColor.clone()
        : null,
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
    snapshot.color ?? undefined,
  );
  applyTransform(mesh, snapshot.transform);
  mesh.position.addInPlace(offset);
  return mesh;
}

/**
 * 에디터 내부 클립보드 (시스템 클립보드는 쓰지 않는다).
 * 붙여넣을 위치는 배치 모드에서 사용자가 고른다 (placement.startSnapshot).
 */
export type Clipboard = {
  copy(mesh: AbstractMesh): boolean;
  get(): MeshSnapshot | null;
  hasContent(): boolean;
  subscribe(onChange: () => void): () => void;
};

export function createClipboard(): Clipboard {
  let snapshot: MeshSnapshot | null = null;
  const listeners = new Set<() => void>();

  return {
    copy(mesh) {
      const next = captureMeshSnapshot(mesh);
      if (!next) return false;
      snapshot = next;
      listeners.forEach((listener) => listener());
      return true;
    },
    get: () => snapshot,
    hasContent: () => snapshot !== null,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
