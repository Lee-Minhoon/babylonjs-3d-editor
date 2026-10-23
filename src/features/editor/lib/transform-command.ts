import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { Command } from "./history";

/** 메쉬의 위치·회전·크기 스냅샷. 회전 기즈모는 rotationQuaternion을 쓰므로 둘 다 저장한다. */
export type TransformSnapshot = {
  position: Vector3;
  rotation: Vector3;
  rotationQuaternion: Quaternion | null;
  scaling: Vector3;
};

export function captureTransform(mesh: AbstractMesh): TransformSnapshot {
  return {
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    rotationQuaternion: mesh.rotationQuaternion?.clone() ?? null,
    scaling: mesh.scaling.clone(),
  };
}

export function applyTransform(
  mesh: AbstractMesh,
  snapshot: TransformSnapshot,
) {
  mesh.position.copyFrom(snapshot.position);
  if (snapshot.rotationQuaternion) {
    mesh.rotationQuaternion = snapshot.rotationQuaternion.clone();
  } else {
    mesh.rotationQuaternion = null;
    mesh.rotation.copyFrom(snapshot.rotation);
  }
  mesh.scaling.copyFrom(snapshot.scaling);
}

export function isSameTransform(
  a: TransformSnapshot,
  b: TransformSnapshot,
): boolean {
  const sameQuaternion =
    a.rotationQuaternion && b.rotationQuaternion
      ? a.rotationQuaternion.equals(b.rotationQuaternion)
      : a.rotationQuaternion === b.rotationQuaternion;
  return (
    a.position.equals(b.position) &&
    a.rotation.equals(b.rotation) &&
    sameQuaternion &&
    a.scaling.equals(b.scaling)
  );
}

type TransformKind = "이동" | "회전" | "크기";

/**
 * 기즈모 드래그 한 번 = Command 하나.
 * 드래그 중에는 기즈모가 메쉬를 직접 움직이고, 드래그가 끝나면 before/after로 기록한다.
 * (첫 execute는 이미 적용된 after를 다시 적용할 뿐이라 무해하다)
 */
export function createTransformCommand(
  mesh: AbstractMesh,
  kind: TransformKind,
  before: TransformSnapshot,
  after: TransformSnapshot,
): Command {
  return {
    label: `${mesh.name} ${kind}`,
    execute: () => applyTransform(mesh, after),
    undo: () => applyTransform(mesh, before),
  };
}
