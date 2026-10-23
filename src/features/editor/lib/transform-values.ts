import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Tools } from "@babylonjs/core/Misc/tools";

/**
 * 속성 패널용 변형 값. 회전은 사람이 읽는 단위(도)로 다룬다.
 * 회전 기즈모를 쓴 메쉬는 rotationQuaternion을 가지므로, 읽을 땐 오일러로 변환하고
 * 쓸 땐 원래 표현(쿼터니언/오일러)을 유지한다.
 */
export type TransformField = "position" | "rotation" | "scaling";
export type Axis = 0 | 1 | 2;
export type Vec3Tuple = readonly [number, number, number];
export type TransformValues = Record<TransformField, Vec3Tuple>;

/** 부동소수 잔여값(-0, 1e-15 등)이 "-0"처럼 표시되지 않도록 0으로 정리 */
const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);
const toTuple = (v: Vector3): Vec3Tuple => [clean(v.x), clean(v.y), clean(v.z)];

export function getTransformValues(mesh: AbstractMesh): TransformValues {
  const euler = mesh.rotationQuaternion?.toEulerAngles() ?? mesh.rotation;
  return {
    position: toTuple(mesh.position),
    rotation: toTuple(euler.scale(180 / Math.PI)),
    scaling: toTuple(mesh.scaling),
  };
}

/** 한 축의 값을 메쉬에 바로 적용한다 (히스토리 기록 없음 — 기록은 호출하는 쪽이 커밋 시점에) */
export function setTransformAxis(
  mesh: AbstractMesh,
  field: TransformField,
  axis: Axis,
  value: number,
) {
  if (field !== "rotation") {
    const target = field === "position" ? mesh.position : mesh.scaling;
    const next = toTuple(target).slice() as [number, number, number];
    next[axis] = value;
    target.set(...next);
    return;
  }

  const degrees = getTransformValues(mesh).rotation.slice() as [
    number,
    number,
    number,
  ];
  degrees[axis] = value;
  const radians = new Vector3(
    Tools.ToRadians(degrees[0]),
    Tools.ToRadians(degrees[1]),
    Tools.ToRadians(degrees[2]),
  );
  if (mesh.rotationQuaternion) {
    mesh.rotationQuaternion = Quaternion.FromEulerVector(radians);
  } else {
    mesh.rotation.copyFrom(radians);
  }
}

export const TRANSFORM_KIND: Record<TransformField, "이동" | "회전" | "크기"> =
  {
    position: "이동",
    rotation: "회전",
    scaling: "크기",
  };
