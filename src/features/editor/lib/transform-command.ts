import {
  type Matrix,
  Quaternion,
  Vector3,
} from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { Command } from "./history";

/** 메쉬의 위치·회전·크기 스냅샷. 회전 기즈모는 rotationQuaternion을 쓰므로 둘 다 저장한다. */
export type TransformSnapshot = {
  position: Vector3;
  rotation: Vector3;
  rotationQuaternion: Quaternion | null;
  scaling: Vector3;
};

/**
 * 행렬을 이 메쉬의 위치·회전·크기로 분해한다. 회전은 메쉬의 지금 표현(쿼터니언/오일러)을 따른다.
 * 전단(shear)이 있는 행렬은 TRS로 근사된다.
 */
export function decomposeTransform(
  mesh: AbstractMesh,
  matrix: Matrix,
): TransformSnapshot {
  const position = new Vector3();
  const scaling = new Vector3();
  const quaternion = new Quaternion();
  matrix.decompose(scaling, quaternion, position);
  const usesQuaternion = mesh.rotationQuaternion !== null;
  return {
    position,
    rotation: usesQuaternion ? Vector3.Zero() : quaternion.toEulerAngles(),
    rotationQuaternion: usesQuaternion ? quaternion : null,
    scaling,
  };
}

/** 메쉬 자신의 값 (부모가 있으면 부모 기준) — 패널·파일·변형 Command가 쓰는 값 */
export function captureTransform(mesh: AbstractMesh): TransformSnapshot {
  return {
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    rotationQuaternion: mesh.rotationQuaternion?.clone() ?? null,
    scaling: mesh.scaling.clone(),
  };
}

/** 월드 기준 값 (복사본을 최상위에 놓을 때) */
export function captureWorldTransform(mesh: AbstractMesh): TransformSnapshot {
  return mesh.parent
    ? decomposeTransform(mesh, mesh.computeWorldMatrix(true))
    : captureTransform(mesh);
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

/** 이만큼 안의 차이는 같은 변형으로 본다 (float32 행렬 왕복 오차는 1e-7 수준) */
const EPSILON = 1e-5;

function toQuaternion(snapshot: TransformSnapshot): Quaternion {
  return snapshot.rotationQuaternion ?? snapshot.rotation.toQuaternion();
}

/**
 * 같은 변형인지 — 숫자가 아니라 "같은 자세"로 비교한다.
 * 행렬 분해(여러 개 선택 드래그·부모 바꾸기)나 오일러↔쿼터니언 변환은 값을 비트 단위로 보존하지 않고,
 * X=180°가 (0, 180, 180)처럼 다른 오일러로 돌아오기도 한다. 그런 차이로 Command를 만들면
 * 클릭만 해도 "이동"이 기록되고 undo 해도 아무것도 안 바뀐다.
 */
export function isSameTransform(
  a: TransformSnapshot,
  b: TransformSnapshot,
): boolean {
  const sameRotation =
    Math.abs(Quaternion.Dot(toQuaternion(a), toQuaternion(b))) > 1 - EPSILON;
  return (
    a.position.equalsWithEpsilon(b.position, EPSILON) &&
    sameRotation &&
    a.scaling.equalsWithEpsilon(b.scaling, EPSILON)
  );
}

type TransformKind =
  "이동" | "회전" | "크기" | "바닥에 붙이기" | "정렬" | "분배";

/**
 * 변형 Command (기즈모 드래그·패널 입력·바닥에 붙이기·정렬).
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
