import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import {
  addPresetObject,
  getLightValues,
  type LightValues,
} from "./editor-lights";
import {
  getLibraryId,
  getMaterialLibrary,
  linkMaterial,
} from "./material-library";
import {
  getEditorChildren,
  setMeshParent,
  topLevelOnly,
} from "./mesh-hierarchy";
import { getMaterialValues, type MaterialValues } from "./mesh-material";
import {
  findPreset,
  getPresetId,
  getShapeParams,
  type MeshPresetId,
  type ShapeParams,
} from "./mesh-presets";
import {
  applyTransform,
  captureTransform,
  captureWorldTransform,
  type TransformSnapshot,
} from "./transform-command";

/**
 * 메쉬를 다시 만들 수 있는 데이터. 메쉬 객체가 아니라 데이터를 담아서
 * 잘라낸 원본이 나중에 완전히 해제돼도 붙여넣을 수 있다.
 * 자식까지 담는다 (복사본도 같은 계층). 맨 위 변형은 월드 기준(복사본은 최상위에 놓인다), 자식은 부모 기준.
 */
export type MeshSnapshot = {
  presetId: MeshPresetId;
  transform: TransformSnapshot;
  /** null이면 새 메쉬처럼 랜덤 값 */
  material: MaterialValues | null;
  /** 쓰던 공유 머티리얼 id — 붙여넣을 때 아직 라이브러리에 있으면 같은 머티리얼에 연결한다 (없으면 material 값으로) */
  materialRef: string | null;
  /** 모양 값 (프리셋 파라미터) */
  shape: ShapeParams;
  /** 조명 값 (조명 객체만, 메쉬는 null) */
  light: LightValues | null;
  /** 자식들 (변형은 이 객체 기준) */
  children: MeshSnapshot[];
};

function capture(
  mesh: AbstractMesh,
  transform: TransformSnapshot,
): MeshSnapshot | null {
  const presetId = getPresetId(mesh);
  if (!presetId) return null;
  return {
    presetId,
    transform,
    material: getMaterialValues(mesh),
    materialRef: getLibraryId(mesh),
    shape: getShapeParams(mesh) ?? {},
    light: getLightValues(mesh),
    children: getEditorChildren(mesh).flatMap(
      (child) => capture(child, captureTransform(child)) ?? [],
    ),
  };
}

export function captureMeshSnapshot(mesh: AbstractMesh): MeshSnapshot | null {
  return capture(mesh, captureWorldTransform(mesh));
}

function createObject(scene: Scene, snapshot: MeshSnapshot): Mesh {
  const preset = findPreset(snapshot.presetId);
  if (!preset) throw new Error(`Unknown preset: ${snapshot.presetId}`);
  const mesh = addPresetObject(scene, preset, snapshot);
  const shared =
    snapshot.materialRef &&
    getMaterialLibrary(scene)?.find(snapshot.materialRef);
  if (shared) linkMaterial(mesh, shared);
  applyTransform(mesh, snapshot.transform);
  for (const child of snapshot.children) {
    setMeshParent(createObject(scene, child), mesh);
  }
  return mesh;
}

/** 스냅샷으로 새 메쉬(와 자식들)를 최상위에 만들고 offset만큼 옮긴다. 이름은 새로 붙는다 ("Box 4" …). */
export function createMeshFromSnapshot(
  scene: Scene,
  snapshot: MeshSnapshot,
  offset: Vector3,
): Mesh {
  const mesh = createObject(scene, snapshot);
  mesh.position.addInPlace(offset);
  return mesh;
}

/** 에디터 메쉬들의 스냅샷 (에디터 메쉬가 아닌 것은 건너뛴다). 조상을 함께 고른 자식은 조상의 스냅샷에 들어간다 */
export function captureMeshSnapshots(
  meshes: readonly AbstractMesh[],
): MeshSnapshot[] {
  return topLevelOnly(meshes).flatMap(
    (mesh) => captureMeshSnapshot(mesh) ?? [],
  );
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
