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

/** 모양 파라미터 값 (프리셋마다 키가 다르다 — MeshPreset.params) */
export type ShapeParams = Readonly<Record<string, number>>;

/** 모양 파라미터 하나. 속성 패널 슬라이더 범위이자 파일 검증 범위 */
export type ShapeParamDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** 분할 수처럼 정수만 */
  integer?: boolean;
};

/**
 * 메쉬 프리셋. 원점 중심·크기 1 정도로 만든다.
 * 바닥에 놓을 높이는 여기서 정하지 않고 배치 도구가 바운딩 박스로 잰다 (placement-tool의 layoutItems).
 * params는 크기 조절만으로는 안 되는 모양 값 (원기둥 위·아래 지름, 분할 수 …). 기본값으로 만들면 예전 모양과 같다.
 * create는 params의 모든 키를 받는다 (빠진 값은 shapeParamsOf가 기본값으로 채운다).
 */
export type MeshPreset = {
  id: MeshPresetId;
  label: string;
  /** 검색형 추가 메뉴에서 함께 찾는 말 (한글 이름 등) */
  keywords: readonly string[];
  params: readonly ShapeParamDef[];
  create: (name: string, scene: Scene, shape: ShapeParams) => Mesh;
};

const tessellation = (defaultValue: number, max = 64): ShapeParamDef => ({
  key: "tessellation",
  label: "둘레 분할",
  min: 3,
  max,
  step: 1,
  default: defaultValue,
  integer: true,
});

const diameters = (top: number, bottom: number): ShapeParamDef[] => [
  {
    key: "diameterTop",
    label: "위 지름",
    min: 0,
    max: 2,
    step: 0.05,
    default: top,
  },
  {
    key: "diameterBottom",
    label: "아래 지름",
    min: 0,
    max: 2,
    step: 0.05,
    default: bottom,
  },
];

export const MESH_PRESETS: readonly MeshPreset[] = [
  {
    id: "box",
    label: "Box",
    keywords: ["상자", "큐브", "cube"],
    params: [],
    create: (name, scene) => CreateBox(name, { size: 1 }, scene),
  },
  {
    id: "sphere",
    label: "Sphere",
    keywords: ["구", "공", "ball"],
    params: [
      {
        key: "segments",
        label: "분할",
        min: 3,
        max: 64,
        step: 1,
        default: 32,
        integer: true,
      },
    ],
    create: (name, scene, { segments }) =>
      CreateSphere(name, { diameter: 1, segments }, scene),
  },
  {
    id: "ico-sphere",
    label: "IcoSphere",
    keywords: ["정이십면체", "구", "ico"],
    params: [
      {
        key: "subdivisions",
        label: "분할",
        min: 1,
        max: 6,
        step: 1,
        default: 2,
        integer: true,
      },
    ],
    create: (name, scene, { subdivisions }) =>
      CreateIcoSphere(name, { radius: 0.5, subdivisions }, scene),
  },
  {
    id: "cylinder",
    label: "Cylinder",
    keywords: ["원기둥", "기둥", "실린더"],
    // Babylon 기본 둘레 분할은 24
    params: [...diameters(1, 1), tessellation(24)],
    create: (name, scene, shape) =>
      CreateCylinder(name, { height: 1, ...shape }, scene),
  },
  {
    id: "cone",
    label: "Cone",
    keywords: ["원뿔", "콘", "뿔"],
    params: [...diameters(0, 1), tessellation(24)],
    create: (name, scene, shape) =>
      CreateCylinder(name, { height: 1, ...shape }, scene),
  },
  {
    id: "capsule",
    label: "Capsule",
    keywords: ["캡슐", "알약", "pill"],
    // 높이 1에 반지름이 0.5를 넘으면 모양이 깨진다
    params: [
      {
        key: "radius",
        label: "반지름",
        min: 0.05,
        max: 0.5,
        step: 0.01,
        default: 0.25,
      },
    ],
    create: (name, scene, { radius }) =>
      CreateCapsule(name, { height: 1, radius }, scene),
  },
  {
    id: "torus",
    label: "Torus",
    keywords: ["도넛", "토러스", "고리", "링", "ring"],
    params: [
      {
        key: "thickness",
        label: "두께",
        min: 0.05,
        max: 0.9,
        step: 0.01,
        default: 0.3,
      },
      tessellation(48, 96),
    ],
    create: (name, scene, shape) =>
      CreateTorus(name, { diameter: 1, ...shape }, scene),
  },
  {
    id: "plane",
    label: "Plane",
    keywords: ["평면", "판", "바닥"],
    params: [],
    create: (name, scene) =>
      CreatePlane(
        name,
        { size: 1, sideOrientation: 2 /* DOUBLESIDE */ },
        scene,
      ),
  },
];

/** 프리셋의 모양 값: 주어진 값 위에 빠진 키는 기본값 (모르는 키는 버린다) */
export function shapeParamsOf(
  preset: MeshPreset,
  shape: ShapeParams = {},
): ShapeParams {
  return Object.fromEntries(
    preset.params.map((param) => [
      param.key,
      shape[param.key] ?? param.default,
    ]),
  );
}

export function findPreset(id: MeshPresetId): MeshPreset | undefined {
  return MESH_PRESETS.find((preset) => preset.id === id);
}

/** 에디터에서 추가한 메쉬에 붙는 메타데이터. shape는 지금 모양 값 (mesh-shape가 바꾼다) */
type EditorMeshMetadata = {
  editor: { presetId: MeshPresetId; shape: ShapeParams };
};

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

/** 에디터 메쉬의 모양 값 (만들 때 기억해 둔 값). 에디터 메쉬가 아니면 null */
export function getShapeParams(mesh: AbstractMesh): ShapeParams | null {
  const editor = getEditorMetadata(mesh);
  return editor ? { ...editor.shape } : null;
}

/** 메타데이터의 모양 값만 바꾼다 (지오메트리는 mesh-shape의 applyShapeParams가 다시 만든다) */
export function recordShapeParams(mesh: AbstractMesh, shape: ShapeParams) {
  const editor = getEditorMetadata(mesh);
  if (editor) editor.shape = { ...shape };
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
  /** 모양 값. 빠진 키는 기본값 (복사·파일 열기는 원본 값을 넘긴다) */
  shape?: ShapeParams,
): Mesh {
  if (name) reserveName(scene, preset, name);
  else name = nextName(scene, preset);
  const params = shapeParamsOf(preset, shape);
  const mesh = preset.create(name, scene, params);

  mesh.material = createMeshMaterial(`${name} Material`, scene, material);

  mesh.metadata = {
    editor: { presetId: preset.id, shape: params },
  } satisfies EditorMeshMetadata;
  return mesh;
}
