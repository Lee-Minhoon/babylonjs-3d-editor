import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
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

export type MeshPresetId =
  | "box"
  | "sphere"
  | "ico-sphere"
  | "cylinder"
  | "cone"
  | "capsule"
  | "torus"
  | "plane";

export type MeshPreset = {
  id: MeshPresetId;
  label: string;
  create: (name: string, scene: Scene) => Mesh;
  /** 바닥(y=0) 위에 올려두기 위한 높이 오프셋 */
  restY: number;
};

export const MESH_PRESETS: readonly MeshPreset[] = [
  {
    id: "box",
    label: "Box",
    create: (name, scene) => CreateBox(name, { size: 1 }, scene),
    restY: 0.5,
  },
  {
    id: "sphere",
    label: "Sphere",
    create: (name, scene) =>
      CreateSphere(name, { diameter: 1, segments: 32 }, scene),
    restY: 0.5,
  },
  {
    id: "ico-sphere",
    label: "IcoSphere",
    create: (name, scene) =>
      CreateIcoSphere(name, { radius: 0.5, subdivisions: 2 }, scene),
    restY: 0.5,
  },
  {
    id: "cylinder",
    label: "Cylinder",
    create: (name, scene) =>
      CreateCylinder(name, { height: 1, diameter: 1 }, scene),
    restY: 0.5,
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
    restY: 0.5,
  },
  {
    id: "capsule",
    label: "Capsule",
    create: (name, scene) =>
      CreateCapsule(name, { height: 1, radius: 0.25 }, scene),
    restY: 0.5,
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
    restY: 0.15,
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
    restY: 0.5,
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

/** 파일에서 불러온 이름("Box 7")을 쓰면, 다음 새 메쉬 번호가 그 뒤부터 이어지게 한다. */
function reserveName(scene: Scene, preset: MeshPreset, name: string) {
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
 * 프리셋 메쉬를 씬에 추가한다. 머티리얼은 메쉬마다 별도로 만들고 랜덤 색을 준다.
 * @param surfacePoint 메쉬 밑면이 닿을 표면 위의 점 (바닥 또는 다른 메쉬 윗면)
 */
export function addPresetMesh(
  scene: Scene,
  preset: MeshPreset,
  surfacePoint: Vector3,
  /** 지정하지 않으면 랜덤 색 (복사·복제는 원본 색을 넘긴다) */
  color?: Color3,
  /** 지정하지 않으면 "Box 3"처럼 새 번호 (파일 열기는 저장된 이름을 넘긴다) */
  name?: string,
): Mesh {
  if (name) reserveName(scene, preset, name);
  else name = nextName(scene, preset);
  const mesh = preset.create(name, scene);
  mesh.position.set(
    surfacePoint.x,
    surfacePoint.y + preset.restY,
    surfacePoint.z,
  );

  const material = new StandardMaterial(`${name} Material`, scene);
  material.diffuseColor =
    color?.clone() ?? Color3.FromHSV(Math.random() * 360, 0.5, 0.9);
  mesh.material = material;

  mesh.metadata = {
    editor: { presetId: preset.id },
  } satisfies EditorMeshMetadata;
  return mesh;
}
