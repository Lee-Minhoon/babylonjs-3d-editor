// Ray와 함께 ray.intersectsMesh를 등록한다
import { Ray } from "@babylonjs/core/Culling/ray";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { type Command, createMacroCommand, macroLabel } from "./history";
import { getMeshFlag } from "./mesh-flags";
import {
  getEditorDescendants,
  getEditorParent,
  topLevelOnly,
} from "./mesh-hierarchy";
import { inCreationOrder, isLightObject } from "./mesh-presets";
import {
  applyTransform,
  captureTransform,
  createTransformCommand,
  type TransformKind,
  type TransformSnapshot,
} from "./transform-command";

/*
 * 바닥에 붙이기 · 정렬 · 분배. 모두 위치만 옮기고, 메쉬들을 Command 하나로 묶는다 (undo 한 번).
 * 기준은 월드 바운딩 박스(AABB)다 — 돌린 메쉬는 박스가 실제 모양보다 클 수 있다.
 * 자식은 부모를 따라 움직이므로, 부모와 자식을 함께 고르면 부모만 옮긴다 (topLevelOnly).
 * 자식의 이동량은 월드 기준으로 재고 부모 기준으로 바꿔 넣는다.
 */

export type AlignAxis = "x" | "y" | "z";
export type AlignEdge = "min" | "center" | "max";

/** 이 값 이상으로 위를 향한 면에만 붙인다 (배치 도구와 같은 기준) */
const TOP_FACE_MIN_NORMAL_Y = 0.7;
/** 이보다 작은 이동은 무시한다 (이미 붙어 있으면 Command를 만들지 않음) */
const EPSILON = 1e-4;
/** 밑면 아래를 살피는 점: 가운데 + 박스 가로·세로 절반 지점 네 곳 */
const FOOTPRINT = [
  [0, 0],
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
] as const;

function worldBounds(mesh: AbstractMesh) {
  mesh.computeWorldMatrix(true);
  const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
  return { min: minimumWorld.clone(), max: maximumWorld.clone() };
}

/** 월드 이동량 → 이 메쉬의 position(부모 기준)에 더할 값 */
function toLocalDelta(mesh: AbstractMesh, delta: Vector3): Vector3 {
  const parent = getEditorParent(mesh);
  return parent
    ? Vector3.TransformNormal(
        delta,
        Matrix.Invert(parent.computeWorldMatrix(true)),
      )
    : delta;
}

/** 위치만 월드 기준 delta만큼 옮긴 변형 */
function shifted(
  mesh: AbstractMesh,
  before: TransformSnapshot,
  delta: Vector3,
): TransformSnapshot {
  return {
    ...before,
    position: before.position.add(toLocalDelta(mesh, delta)),
  };
}

/** 메쉬와 자손의 월드 행렬을 다시 계산한다 (피킹은 캐시된 월드 행렬을 쓴다) */
function refreshWorld(mesh: AbstractMesh) {
  mesh.computeWorldMatrix(true);
  for (const child of getEditorDescendants(mesh)) {
    child.computeWorldMatrix(true);
  }
}

/** 메쉬별 이동량으로 Command 하나 (움직이지 않는 메쉬는 뺀다). 모두 그대로면 null */
function createShiftCommand(
  moves: readonly { mesh: AbstractMesh; delta: Vector3 }[],
  verb: Extract<TransformKind, "바닥에 붙이기" | "정렬" | "분배">,
): Command | null {
  const commands = moves
    .filter(({ delta }) => delta.length() > EPSILON)
    .map(({ mesh, delta }) => {
      const before = captureTransform(mesh);
      return createTransformCommand(
        mesh,
        verb,
        before,
        shifted(mesh, before, delta),
      );
    });
  if (commands.length === 0) return null;
  return createMacroCommand(macroLabel(commands, verb), commands);
}

/** 표면이 될 수 있는 메쉬와 그 월드 AABB (광선을 쏘기 전에 박스로 거른다) */
type Obstacle = { mesh: AbstractMesh; min: Vector3; max: Vector3 };

const toObstacle = (mesh: AbstractMesh): Obstacle => ({
  mesh,
  ...worldBounds(mesh),
});

/**
 * 메쉬 밑면이 닿을 높이: 바운딩 박스 가운데 높이에서 아래로 광선을 쏴 맞은 윗면 중 가장 높은 곳,
 * 없으면 바닥(y=0). 가운데에서 쏘므로 조금 파묻힌 메쉬는 그 표면 위로 올라온다.
 * scene.multiPickWithRay는 광선마다 씬의 모든 메쉬를 훑어 전체 선택 → End가 O(M·N)이 된다
 * (2000개에 8초) — 광선 아래에 박스가 걸치는 메쉬에만 정확한 교차를 묻는다.
 */
function findFloor(mesh: AbstractMesh, obstacles: readonly Obstacle[]): number {
  const { min, max } = worldBounds(mesh);
  const center = min.add(max).scale(0.5);
  const half = max.subtract(min).scale(0.5);
  let floor = 0;
  for (const [fx, fz] of FOOTPRINT) {
    const origin = new Vector3(
      center.x + fx * half.x,
      center.y,
      center.z + fz * half.z,
    );
    const ray = new Ray(origin, Vector3.Down());
    for (const obstacle of obstacles) {
      if (
        obstacle.min.y > origin.y ||
        origin.x < obstacle.min.x ||
        origin.x > obstacle.max.x ||
        origin.z < obstacle.min.z ||
        origin.z > obstacle.max.z
      ) {
        continue;
      }
      const hit = ray.intersectsMesh(obstacle.mesh);
      const normal = hit.hit ? hit.getNormal(true) : null;
      if (hit.pickedPoint && normal && normal.y >= TOP_FACE_MIN_NORMAL_Y) {
        floor = Math.max(floor, hit.pickedPoint.y);
      }
    }
  }
  return floor;
}

/**
 * 바닥에 붙이기 (End): 각 메쉬를 바로 아래 표면(다른 메쉬 윗면 또는 바닥)으로 내리거나 올린다.
 * 여러 개면 낮은 것부터 차례로 붙여서, 함께 고른 메쉬끼리 쌓여 있어도 위에 있던 것이 아래 것 위에 놓인다.
 * 숨긴 메쉬·조명 아이콘은 표면이 아니다 (잠근 메쉬는 표면이다).
 * 옮기는 메쉬의 자손도 같이 움직이므로 표면이 아니다 (자기 자식 위에 올라가지 않게).
 */
export function createDropToFloorCommand(
  selected: readonly AbstractMesh[],
): Command | null {
  const meshes = topLevelOnly(selected);
  if (meshes.length === 0) return null;
  const scene = meshes[0].getScene();
  const pending = new Set(
    meshes.flatMap((mesh) => [mesh, ...getEditorDescendants(mesh)]),
  );
  const isSurface = (mesh: AbstractMesh) =>
    !getMeshFlag(mesh, "hidden") && !isLightObject(mesh);
  const obstacles = inCreationOrder(scene.meshes)
    .filter((mesh) => !pending.has(mesh) && isSurface(mesh))
    .map(toObstacle);
  const bottoms = new Map(
    meshes.map((mesh) => [mesh, worldBounds(mesh).min.y] as const),
  );
  const ordered = meshes.toSorted((a, b) => bottoms.get(a)! - bottoms.get(b)!);

  // 차례로 실제로 옮겨 보며(다음 메쉬의 표면이 되도록) 이동량을 잰 뒤 원래대로 돌린다
  const originals = ordered.map((mesh) => captureTransform(mesh));
  const moves = ordered.map((mesh) => {
    const delta = new Vector3(
      0,
      findFloor(mesh, obstacles) - bottoms.get(mesh)!,
      0,
    );
    mesh.position.addInPlace(toLocalDelta(mesh, delta));
    refreshWorld(mesh);
    obstacles.push(toObstacle(mesh));
    for (const child of getEditorDescendants(mesh)) {
      if (isSurface(child)) obstacles.push(toObstacle(child));
    }
    return { mesh, delta };
  });
  ordered.forEach((mesh, i) => {
    applyTransform(mesh, originals[i]);
    refreshWorld(mesh);
  });

  return createShiftCommand(moves, "바닥에 붙이기");
}

function edgeValue(
  bounds: { min: Vector3; max: Vector3 },
  axis: AlignAxis,
  edge: AlignEdge,
): number {
  if (edge === "min") return bounds.min[axis];
  if (edge === "max") return bounds.max[axis];
  return (bounds.min[axis] + bounds.max[axis]) / 2;
}

function axisVector(axis: AlignAxis, amount: number): Vector3 {
  const vector = Vector3.Zero();
  vector[axis] = amount;
  return vector;
}

/**
 * 정렬: 선택 전체의 바운딩 박스를 기준으로 각 메쉬의 최소·가운데·최대 면을 맞춘다 (2개 이상).
 * 예: X 최소 = 가장 왼쪽 메쉬의 왼쪽 면에 모두 맞춤.
 */
export function createAlignCommand(
  selected: readonly AbstractMesh[],
  axis: AlignAxis,
  edge: AlignEdge,
): Command | null {
  const meshes = topLevelOnly(selected);
  if (meshes.length < 2) return null;
  const bounds = meshes.map(worldBounds);
  const total = {
    min: bounds.reduce((acc, b) => Vector3.Minimize(acc, b.min), bounds[0].min),
    max: bounds.reduce((acc, b) => Vector3.Maximize(acc, b.max), bounds[0].max),
  };
  const target = edgeValue(total, axis, edge);
  return createShiftCommand(
    meshes.map((mesh, i) => ({
      mesh,
      delta: axisVector(axis, target - edgeValue(bounds[i], axis, edge)),
    })),
    "정렬",
  );
}

/**
 * 분배: 축 방향으로 양 끝 메쉬는 두고, 사이 메쉬들의 중심을 같은 간격으로 놓는다 (3개 이상).
 */
export function createDistributeCommand(
  selected: readonly AbstractMesh[],
  axis: AlignAxis,
): Command | null {
  const meshes = topLevelOnly(selected);
  if (meshes.length < 3) return null;
  const centers = meshes
    .map((mesh) => ({
      mesh,
      center: edgeValue(worldBounds(mesh), axis, "center"),
    }))
    .toSorted((a, b) => a.center - b.center);
  const first = centers[0].center;
  const step = (centers.at(-1)!.center - first) / (centers.length - 1);
  return createShiftCommand(
    centers.map(({ mesh, center }, i) => ({
      mesh,
      delta: axisVector(axis, first + step * i - center),
    })),
    "분배",
  );
}
