import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import {
  createMeshMaterial,
  type MaterialValues,
  randomMaterialValues,
} from "./mesh-material";

export type MeshPresetId =
  | "box"
  | "sphere"
  | "ico-sphere"
  | "cylinder"
  | "cone"
  | "capsule"
  | "torus"
  | "plane";

/**
 * 메쉬 프리셋. 원점 중심·크기 1 정도로 만든다.
 * 바닥에 놓을 높이는 여기서 정하지 않고 배치 도구가 바운딩 박스로 잰다 (placement-tool의 layoutItems).
 */
export type MeshPreset = {
  id: MeshPresetId;
  label: string;
  create: (name: string, scene: Scene) => Mesh;
};

export const MESH_PRESETS: readonly MeshPreset[] = [
  {
    id: "box",
    label: "Box",
    create: (name, scene) => CreateBox(name, { size: 1 }, scene),
  },
  {
    id: "sphere",
    label: "Sphere",
    create: (name, scene) =>
      CreateSphere(name, { diameter: 1, segments: 32 }, scene),
  },
  {
    id: "ico-sphere",
    label: "IcoSphere",
    create: (name, scene) =>
      CreateIcoSphere(name, { radius: 0.5, subdivisions: 2 }, scene),
  },
  {
    id: "cylinder",
    label: "Cylinder",
    create: (name, scene) =>
      CreateCylinder(name, { height: 1, diameter: 1 }, scene),
  },
  {
    id: "cone",
    label: "Cone",
    create: (name, scene) =>
      CreateCylinder(
        name,
        { height: 1, diameterTop: 0, diameterBottom: 1 },
        scene,
      ),
  },
  {
    id: "capsule",
    label: "Capsule",
    create: (name, scene) =>
      CreateCapsule(name, { height: 1, radius: 0.25 }, scene),
  },
  {
    id: "torus",
    label: "Torus",
    create: (name, scene) =>
      CreateTorus(
        name,
        { diameter: 1, thickness: 0.3, tessellation: 48 },
        scene,
      ),
  },
  {
    id: "plane",
    label: "Plane",
    create: (name, scene) =>
      CreatePlane(
        name,
        { size: 1, sideOrientation: 2 /* DOUBLESIDE */ },
        scene,
      ),
  },
];

export function findPreset(id: MeshPresetId): MeshPreset | undefined {
  return MESH_PRESETS.find((preset) => preset.id === id);
}

/** 에디터에서 추가한 메쉬에 붙는 메타데이터 */
type EditorMeshMetadata = { editor: { presetId: MeshPresetId } };

function getEditorMetadata(mesh: AbstractMesh) {
  return (mesh.metadata as Partial<EditorMeshMetadata> | null)?.editor;
}

export function isEditorMesh(mesh: AbstractMesh): boolean {
  return Boolean(getEditorMetadata(mesh));
}

/**
 * 에디터 메쉬만 생성 순서(uniqueId)로. 씬 목록·파일 저장이 같은 순서를 쓴다.
 * undo로 다시 붙은 메쉬는 scene.meshes 끝에 들어가므로 배열 순서를 믿으면 안 된다.
 */
export function inCreationOrder(
  meshes: readonly AbstractMesh[],
): AbstractMesh[] {
  return meshes
    .filter(isEditorMesh)
    .toSorted((a, b) => a.uniqueId - b.uniqueId);
}

/** 에디터에서 추가한 메쉬의 프리셋 id. 에디터 메쉬가 아니면 null */
export function getPresetId(mesh: AbstractMesh): MeshPresetId | null {
  return getEditorMetadata(mesh)?.presetId ?? null;
}

const nameCounters = new WeakMap<Scene, Map<MeshPresetId, number>>();

/**
 * "Box 1", "Box 2" … 씬·프리셋별로 계속 증가하는 번호.
 * undo로 씬에서 떼어둔 메쉬는 scene.meshes에 없으므로, 씬을 뒤져 번호를 정하면 이름이 겹칠 수 있다.
 */
function nextName(scene: Scene, preset: MeshPreset): string {
  let counters = nameCounters.get(scene);
  if (!counters) nameCounters.set(scene, (counters = new Map()));
  const next = (counters.get(preset.id) ?? 0) + 1;
  counters.set(preset.id, next);
  return `${preset.label} ${next}`;
}

/**
 * 이름이 "Box 7"처럼 프리셋 번호 형식이면, 다음 새 메쉬 번호가 그 뒤부터 이어지게 한다.
 * (파일 열기·이름 바꾸기 — 번호는 늘어나기만 하므로 겹치는 이름이 새로 생기지 않는다)
 */
export function reserveName(scene: Scene, preset: MeshPreset, name: string) {
  const number = Number(/ (\d+)$/.exec(name)?.[1]);
  if (!name.startsWith(`${preset.label} `) || !Number.isInteger(number)) return;
  let counters = nameCounters.get(scene);
  if (!counters) nameCounters.set(scene, (counters = new Map()));
  counters.set(preset.id, Math.max(counters.get(preset.id) ?? 0, number));
}

/** 새 씬·열기에서 이름 번호를 처음(1)부터 다시 매긴다. */
export function resetMeshNames(scene: Scene) {
  nameCounters.delete(scene);
}

/**
 * 프리셋 메쉬를 원점에 만들어 씬에 추가한다. 머티리얼(PBR)은 메쉬마다 별도로 만든다.
 * 위치·회전·크기는 호출하는 쪽(배치·붙여넣기·파일 열기)이 정한다.
 */
export function addPresetMesh(
  scene: Scene,
  preset: MeshPreset,
  /** 지정하지 않으면 랜덤 색 (복사·복제·파일 열기는 원본 값을 넘긴다) */
  material: MaterialValues = randomMaterialValues(),
  /** 지정하지 않으면 "Box 3"처럼 새 번호 (파일 열기는 저장된 이름을 넘긴다) */
  name?: string,
): Mesh {
  if (name) reserveName(scene, preset, name);
  else name = nextName(scene, preset);
  const mesh = preset.create(name, scene);

  mesh.material = createMeshMaterial(`${name} Material`, scene, material);

  mesh.metadata = {
    editor: { presetId: preset.id },
  } satisfies EditorMeshMetadata;
  return mesh;
}
