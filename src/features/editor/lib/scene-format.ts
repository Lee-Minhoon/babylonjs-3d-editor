import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { FileTypeOptions } from "@/lib/file-access";

import { getAssetStore } from "./asset-registry";
import type { AssetType } from "./asset-store";
import {
  addPresetObject,
  getLightValues,
  LIGHT_DEFAULTS,
  LIGHT_RANGES,
  type LightValues,
} from "./editor-lights";
import {
  getLibraryId,
  getMaterialLibrary,
  linkMaterial,
} from "./material-library";
import { disposeEditorObject } from "./mesh-commands";
import { getMeshFlag, setMeshFlags } from "./mesh-flags";
import { getEditorParent, setMeshParent } from "./mesh-hierarchy";
import {
  getMaterialValues,
  MATERIAL_DEFAULTS,
  type MaterialValues,
  TEXTURE_SLOTS,
  type TextureSlot,
  UV_SCALE_RANGE,
} from "./mesh-material";
import {
  ALL_PRESETS,
  findPreset,
  getPresetId,
  getShapeParams,
  inCreationOrder,
  type LightKind,
  type MeshPreset,
  type MeshPresetId,
  resetMeshNames,
  type ShapeParams,
  shapeParamsOf,
} from "./mesh-presets";
import {
  applySceneSettings,
  DEFAULT_SCENE_SETTINGS,
  getSceneSettings,
  type SceneSettings,
  TONE_MAPPINGS,
} from "./scene-settings";
import { captureTransform } from "./transform-command";

/*
 * 씬 파일(.json) 형식. 에디터 메쉬는 모두 프리셋으로 만들어지므로
 * "어떤 프리셋을 어떤 변형·머티리얼로 놓았는지"만 저장한다 (정점 데이터·카메라·바닥은 저장하지 않음).
 *
 *   {
 *     "format": "babylonjs-3d-editor/scene",
 *     "version": 8,
 *     "settings": { "background": "#1A1A1F", "ambientIntensity": 1, "environmentIntensity": 1,
 *       "exposure": 1, "toneMapping": "none" },
 *     "assets": [{ "id": "3f2a9c01d4e5b6a7", "name": "chair.glb", "type": "model",
 *       "mimeType": "model/gltf-binary" }],
 *     "materials": [{ "id": "a1b2c3d4", "name": "빨간 플라스틱", "material": { "color": "#D03030", … } }],
 *     "meshes": [
 *       { "presetId": "box", "name": "Box 1", "position": [0, 0.5, 0],
 *         "rotation": [0, 45, 0], "scaling": [1, 1, 1],
 *         "material": { "color": "#4F8EF7", "metallic": 0, "roughness": 0.5,
 *           "emissive": "#000000", "alpha": 1, "unlit": false,
 *           "colorMap": null, "normalMap": null, "roughnessMap": null, "uvScale": 1 },
 *         "materialRef": null, "hidden": false, "locked": false, "shape": {}, "light": null, "parent": null },
 *       { "presetId": "point-light", "name": "Point Light 1", …, "material": null, "parent": 0,
 *         "light": { "color": "#FFFFFF", "intensity": 10, "range": 10, "angle": 60, "shadows": false } }
 *     ]
 *   }
 *
 * settings는 씬 환경 설정 (scene-settings). 없거나 빠진 값은 기본값.
 * rotation은 도(°) 단위 오일러 각 (속성 패널과 같음).
 * material은 PBR metallic-roughness (color·emissive는 sRGB), 없으면 null (열 때 랜덤 색).
 * emissive·alpha·unlit이 빠져 있으면 기본값 (발광 없음·불투명·조명 받음).
 * colorMap·normalMap·roughnessMap은 텍스처 이미지 에셋 id (없으면 null), uvScale은 텍스처 반복 (없으면 1).
 * hidden·locked는 숨기기·잠금 (mesh-flags). 없으면 false.
 * shape는 프리셋 모양 값 (MeshPreset.params, 예: 원뿔 { "diameterTop": 0, "diameterBottom": 1, "tessellation": 24 }).
 * 빠진 키는 기본값, 범위 밖이나 그 프리셋에 없는 키는 오류.
 * 조명(presetId가 *-light)은 light 값을 가진다 (빠진 값은 그 종류의 기본값). 메쉬는 light가 null.
 * parent는 부모의 meshes 배열 번호 (최상위는 null). 부모가 있으면 position·rotation·scaling은 부모 기준.
 * 자기 자신·순환·범위 밖 번호는 오류.
 * assets는 씬이 쓰는 에셋 (가져온 모델·텍스처 이미지). 바이트는 씬 묶음 파일(.zip)의 assets/에 따로 있다 (scene-package).
 * 가져온 모델은 presetId "model:<에셋 id>"이고 material·light는 null, shape는 {} (glTF 머티리얼 그대로).
 * materials는 공유 머티리얼 (material-library) 중 메쉬가 쓰는 것. 메쉬의 materialRef가 그 id를 가리키고,
 * 그 메쉬의 material에도 같은 값이 들어 있다 (읽기 쉽게 — 열 때는 materials의 값을 쓴다).
 *
 * 버전 기록:
 *   v1  "color": "#RRGGBB" | null (StandardMaterial diffuse) → v2에서 material.color로 옮기고
 *       metallic·roughness는 기본값
 *   v2  hidden·locked 없음 → v3에서 false
 *   v3  settings·material.emissive/alpha/unlit 없음 → v4에서 기본값
 *   v4  shape 없음 → v5에서 기본 모양 (지금까지 만든 모양과 같다)
 *   v5  조명 객체·light·settings.ambientIntensity 없음 → v6 (조명 없음, 기본 조명 세기 1)
 *   v6  parent 없음 → v7 (모두 최상위)
 *   v7  assets·materials·materialRef·material의 텍스처(colorMap 등)·uvScale 없음
 *       → v8 (에셋·공유 머티리얼·텍스처 없음, 반복 1)
 * 형식을 바꿀 땐 SCENE_FILE_VERSION을 올리고 parseSceneFile에서 이전 버전을 변환한다.
 * 메쉬에 새 속성을 추가하면 MeshSnapshot과 함께 여기도 넣어야 저장된다.
 */

export const SCENE_FILE_FORMAT = "babylonjs-3d-editor/scene";
export const SCENE_FILE_VERSION = 8;

export const SCENE_FILE_TYPE: FileTypeOptions = {
  description: "씬 파일",
  mimeType: "application/json",
  extension: ".json",
};

/** 에셋(모델·텍스처)이 있는 씬: scene.json + assets/를 묶은 zip (scene-package) */
export const SCENE_PACKAGE_TYPE: FileTypeOptions = {
  description: "씬 묶음 파일",
  mimeType: "application/zip",
  extension: ".zip",
};

export type SceneFileAsset = {
  /** 내용 해시 (asset-store) */
  id: string;
  name: string;
  type: AssetType;
  mimeType: string;
};

type Vec3 = [number, number, number];

export type SceneFileMesh = {
  presetId: MeshPresetId;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scaling: Vec3;
  material: MaterialValues | null;
  hidden: boolean;
  locked: boolean;
  shape: ShapeParams;
  light: LightValues | null;
  /** 부모의 meshes 번호. 최상위는 null */
  parent: number | null;
  /** 쓰는 공유 머티리얼 (materials의 id). 전용 머티리얼이면 null */
  materialRef: string | null;
};

export type SceneFileMaterial = {
  id: string;
  name: string;
  material: MaterialValues;
};

export type SceneFileData = {
  format: typeof SCENE_FILE_FORMAT;
  version: typeof SCENE_FILE_VERSION;
  settings: SceneSettings;
  assets: SceneFileAsset[];
  materials: SceneFileMaterial[];
  meshes: SceneFileMesh[];
};

/** 파일 내용이 잘못됐을 때. message는 사용자에게 그대로 보여준다. */
export class SceneFileError extends Error {
  override name = "SceneFileError";
}

const DEGREES = 180 / Math.PI;

/** 0.30000000000000004 같은 부동소수 잡음과 -0을 정리한다 */
function tidy(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  // 아주 큰 값은 1e6을 곱하면 Infinity가 돼 JSON에서 null로 남는다 (열 수 없는 파일) — 그대로 둔다
  if (!Number.isFinite(rounded)) return value;
  return rounded === 0 ? 0 : rounded;
}

function toVec3(vector: Vector3, scale = 1): Vec3 {
  return [
    tidy(vector.x * scale),
    tidy(vector.y * scale),
    tidy(vector.z * scale),
  ];
}

/** 씬 목록에 보이는 에디터 메쉬 (생성 순서) */
export function getEditorMeshes(scene: Scene): AbstractMesh[] {
  return inCreationOrder(scene.meshes);
}

/** 객체들이 쓰는 에셋 id — 모델·텍스처 (처음 쓰인 순서) */
function usedAssetIds(meshes: readonly AbstractMesh[]): string[] {
  const ids = new Set<string>();
  for (const mesh of meshes) {
    const presetId = getPresetId(mesh);
    const model = presetId && findPreset(presetId)?.model;
    if (model) ids.add(model);
    const material = getMaterialValues(mesh);
    for (const { key } of TEXTURE_SLOTS) {
      const id = material?.[key];
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export function serializeScene(scene: Scene): SceneFileData {
  // 에디터 메쉬는 모두 프리셋 id를 가진다 (inCreationOrder가 에디터 메쉬만 남긴다) — 타입 때문에 한 번 더 확인
  const entries = getEditorMeshes(scene).flatMap((mesh) => {
    const presetId = getPresetId(mesh);
    return presetId ? [{ mesh, presetId }] : [];
  });
  const indexOf = new Map(entries.map(({ mesh }, index) => [mesh, index]));
  const meshes = entries.map(({ mesh, presetId }): SceneFileMesh => {
    // 부모가 있으면 부모 기준 값
    const transform = captureTransform(mesh);
    // 회전 기즈모를 쓰면 rotationQuaternion이 생긴다 → 오일러로 바꿔 저장
    const rotation =
      transform.rotationQuaternion?.toEulerAngles() ?? transform.rotation;
    const material = getMaterialValues(mesh);
    const light = getLightValues(mesh);
    const parent = getEditorParent(mesh);
    return {
      presetId,
      name: mesh.name,
      position: toVec3(transform.position),
      rotation: toVec3(rotation, DEGREES),
      scaling: toVec3(transform.scaling),
      material: material && {
        ...material,
        color: material.color.toUpperCase(),
        emissive: material.emissive.toUpperCase(),
      },
      hidden: getMeshFlag(mesh, "hidden"),
      locked: getMeshFlag(mesh, "locked"),
      shape: getShapeParams(mesh) ?? {},
      light: light && { ...light, color: light.color.toUpperCase() },
      parent: (parent && indexOf.get(parent)) ?? null,
      materialRef: getLibraryId(mesh),
    };
  });
  // 메쉬가 쓰는 공유 머티리얼 (처음 쓰인 순서, 값은 그 메쉬의 것 — 같은 머티리얼이라 모두 같다)
  const library = getMaterialLibrary(scene);
  const materials = new Map<string, SceneFileMaterial>();
  meshes.forEach(({ materialRef, material }) => {
    if (materialRef && material && !materials.has(materialRef)) {
      const name = library?.getName(materialRef) ?? materialRef;
      materials.set(materialRef, { id: materialRef, name, material });
    }
  });
  const settings = getSceneSettings(scene);
  const assets = usedAssetIds(entries.map(({ mesh }) => mesh)).map(
    (id): SceneFileAsset => {
      const asset = getAssetStore(scene)?.get(id);
      if (!asset) throw new Error(`Unknown asset: ${id}`);
      return {
        id,
        name: asset.name,
        type: asset.type,
        mimeType: asset.mimeType,
      };
    },
  );
  return {
    format: SCENE_FILE_FORMAT,
    version: SCENE_FILE_VERSION,
    settings: { ...settings, background: settings.background.toUpperCase() },
    assets,
    materials: [...materials.values()],
    meshes,
  };
}

/**
 * 들여쓰기된 JSON에서 숫자 배열 값을 한 줄로 접는다: `"position": [\n 0,\n 0.5,\n 0\n ]` → `"position": [0, 0.5, 0]`.
 * 줄 첫머리의 `"키": [` 부터 닫는 `]`까지 줄 단위로만 맞추므로 문자열 값(메쉬 이름) 안의 글자는 건드리지 않는다
 * — JSON 문자열은 줄바꿈을 담을 수 없고, 값 안의 따옴표는 `\"`로 이스케이프되어 `"키": ` 꼴이 될 수 없다.
 */
const NUMBER_ARRAY_VALUE =
  /^(\s+"[^"\\]*": )\[\n((?:\s+-?[\d.e+-]+,?\n)+)\s+\]/gm;

export function stringifySceneFile(file: SceneFileData): string {
  // [x, y, z] 숫자 배열은 한 줄로 (사람이 읽고 diff 보기 쉽게)
  const text = JSON.stringify(file, null, 2).replace(
    NUMBER_ARRAY_VALUE,
    (_, key: string, numbers: string) =>
      `${key}[${numbers.trim().split(/,\s+/).join(", ")}]`,
  );
  return `${text}\n`;
}

const PRESET_IDS = new Set<string>(ALL_PRESETS.map((preset) => preset.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

const isUnitNumber = (value: unknown): value is number =>
  typeof value === "number" && value >= 0 && value <= 1;

function parseMaterial(
  value: unknown,
  where: string,
  assets: ReadonlyMap<string, SceneFileAsset>,
): MaterialValues | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new SceneFileError(
      `${where}: material은 객체 또는 null이어야 합니다.`,
    );
  }
  const { color, metallic, roughness } = value;
  // v3 이하에는 없다 (v4에서 빠져 있어도 기본값)
  const {
    emissive = MATERIAL_DEFAULTS.emissive,
    alpha = MATERIAL_DEFAULTS.alpha,
    unlit = MATERIAL_DEFAULTS.unlit,
    // v7 이하에는 없다
    uvScale = MATERIAL_DEFAULTS.uvScale,
  } = value;
  for (const [key, hex] of Object.entries({ color, emissive })) {
    if (!isHexColor(hex)) {
      throw new SceneFileError(
        `${where}: material.${key}는 "#RRGGBB"여야 합니다.`,
      );
    }
  }
  for (const [key, number] of Object.entries({ metallic, roughness, alpha })) {
    if (!isUnitNumber(number)) {
      throw new SceneFileError(
        `${where}: material.${key}는 0~1 사이 숫자여야 합니다.`,
      );
    }
  }
  if (typeof unlit !== "boolean") {
    throw new SceneFileError(
      `${where}: material.unlit는 true 또는 false여야 합니다.`,
    );
  }
  if (
    typeof uvScale !== "number" ||
    uvScale < UV_SCALE_RANGE.min ||
    uvScale > UV_SCALE_RANGE.max
  ) {
    throw new SceneFileError(
      `${where}: material.uvScale은 ${UV_SCALE_RANGE.min}~${UV_SCALE_RANGE.max} 사이 숫자여야 합니다.`,
    );
  }
  const maps = Object.fromEntries(
    TEXTURE_SLOTS.map(({ key }) => {
      const id = value[key] ?? null;
      if (id !== null && assets.get(id as string)?.type !== "image") {
        throw new SceneFileError(
          `${where}: material.${key}는 assets의 이미지 id 또는 null이어야 합니다.`,
        );
      }
      return [key, id as string | null];
    }),
  ) as Pick<MaterialValues, TextureSlot>;
  return {
    ...maps,
    uvScale,
    color: color as string,
    metallic: metallic as number,
    roughness: roughness as number,
    emissive: emissive as string,
    alpha: alpha as number,
    unlit,
  };
}

/** v1: "color" 하나 → v2 material */
function parseV1Color(value: unknown, where: string): MaterialValues | null {
  if (value === null || value === undefined) return null;
  if (!isHexColor(value)) {
    throw new SceneFileError(
      `${where}: color는 "#RRGGBB" 또는 null이어야 합니다.`,
    );
  }
  return { color: value, ...MATERIAL_DEFAULTS };
}

/** 가져온 모델의 프리셋 자리 (모양 값·조명 없음). 실제 프리셋은 에셋을 불러온 뒤 asset-store가 등록한다 */
const MODEL_PRESET_SHAPE: MeshPreset = {
  id: "model:",
  label: "모델",
  keywords: [],
  params: [],
  create: () => {
    throw new Error("Model preset placeholder");
  },
};

function parseMesh(
  value: unknown,
  index: number,
  version: number,
  count: number,
  assets: ReadonlyMap<string, SceneFileAsset>,
  materialIds: ReadonlySet<string>,
): SceneFileMesh {
  const where = `meshes[${index}]`;
  if (!isRecord(value)) throw new SceneFileError(`${where}가 객체가 아닙니다.`);
  const { presetId, name, position, rotation, scaling } = value;

  const modelId =
    typeof presetId === "string" && presetId.startsWith("model:")
      ? presetId.slice("model:".length)
      : null;
  if (modelId !== null && assets.get(modelId)?.type !== "model") {
    throw new SceneFileError(
      `${where}: assets에 모델 "${modelId}"가 없습니다.`,
    );
  }
  if (
    typeof presetId !== "string" ||
    (modelId === null && !PRESET_IDS.has(presetId))
  ) {
    throw new SceneFileError(
      `${where}: 알 수 없는 프리셋 "${String(presetId)}"입니다.`,
    );
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new SceneFileError(`${where}: name이 비어 있습니다.`);
  }
  for (const [key, vector] of Object.entries({ position, rotation, scaling })) {
    if (!isVec3(vector)) {
      throw new SceneFileError(
        `${where}: ${key}는 숫자 3개 배열이어야 합니다.`,
      );
    }
  }
  // 모델은 glTF 머티리얼을 쓴다
  const material =
    modelId !== null
      ? null
      : version === 1
        ? parseV1Color(value.color, where)
        : parseMaterial(value.material ?? null, where, assets);
  // v2 이하에는 없다. v3도 빠져 있으면 false (손으로 고친 파일 대비)
  const flags = {
    hidden: value.hidden ?? false,
    locked: value.locked ?? false,
  };
  for (const [key, flag] of Object.entries(flags)) {
    if (typeof flag !== "boolean") {
      throw new SceneFileError(
        `${where}: ${key}는 true 또는 false여야 합니다.`,
      );
    }
  }

  const preset =
    modelId !== null
      ? MODEL_PRESET_SHAPE
      : findPreset(presetId as MeshPresetId)!;
  // v7 이하에는 없다. 머티리얼이 있는 메쉬만
  const materialRef = value.materialRef ?? null;
  if (
    materialRef !== null &&
    (typeof materialRef !== "string" ||
      !materialIds.has(materialRef) ||
      material === null)
  ) {
    throw new SceneFileError(
      `${where}: materialRef는 materials의 id 또는 null이어야 합니다.`,
    );
  }
  // v6 이하에는 없다
  const parent = value.parent ?? null;
  if (
    parent !== null &&
    (typeof parent !== "number" ||
      !Number.isInteger(parent) ||
      parent < 0 ||
      parent >= count ||
      parent === index)
  ) {
    throw new SceneFileError(
      `${where}: parent는 다른 메쉬의 번호(0~${count - 1}) 또는 null이어야 합니다.`,
    );
  }

  return {
    presetId: presetId as MeshPresetId,
    name,
    position: position as Vec3,
    rotation: rotation as Vec3,
    scaling: scaling as Vec3,
    material,
    hidden: flags.hidden as boolean,
    locked: flags.locked as boolean,
    shape: parseShape(value.shape, preset, where),
    light: preset.light ? parseLight(value.light, preset.light, where) : null,
    parent: parent as number | null,
    materialRef,
  };
}

const ASSET_TYPES = new Set<string>(["model", "image"] satisfies AssetType[]);

/** v7 이하에는 없다 */
function parseAssets(value: unknown): SceneFileAsset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SceneFileError("assets는 배열이어야 합니다.");
  }
  const ids = new Set<string>();
  return value.map((asset, index) => {
    const where = `assets[${index}]`;
    if (!isRecord(asset)) {
      throw new SceneFileError(`${where}가 객체가 아닙니다.`);
    }
    const { id, name, type, mimeType } = asset;
    if (typeof id !== "string" || !/^[0-9a-f]{16}$/.test(id) || ids.has(id)) {
      throw new SceneFileError(`${where}: id가 올바르지 않거나 겹칩니다.`);
    }
    ids.add(id);
    if (typeof name !== "string" || typeof mimeType !== "string") {
      throw new SceneFileError(
        `${where}: name·mimeType은 문자열이어야 합니다.`,
      );
    }
    if (typeof type !== "string" || !ASSET_TYPES.has(type)) {
      throw new SceneFileError(`${where}: type은 model 또는 image여야 합니다.`);
    }
    return { id, name, type: type as AssetType, mimeType };
  });
}

/** v7 이하에는 없다 */
function parseMaterials(
  value: unknown,
  assets: ReadonlyMap<string, SceneFileAsset>,
): SceneFileMaterial[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SceneFileError("materials는 배열이어야 합니다.");
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const where = `materials[${index}]`;
    if (!isRecord(entry)) {
      throw new SceneFileError(`${where}가 객체가 아닙니다.`);
    }
    const { id, name } = entry;
    if (typeof id !== "string" || !/^[\w-]{1,64}$/.test(id) || ids.has(id)) {
      throw new SceneFileError(`${where}: id가 없거나 겹칩니다.`);
    }
    ids.add(id);
    if (typeof name !== "string" || name.trim() === "") {
      throw new SceneFileError(`${where}: name이 비어 있습니다.`);
    }
    const material = parseMaterial(entry.material, where, assets);
    if (!material) {
      throw new SceneFileError(`${where}: material이 없습니다.`);
    }
    return { id, name, material };
  });
}

/** 부모를 따라 올라가다 자기에게 돌아오면 오류 */
function checkParentCycles(meshes: readonly SceneFileMesh[]) {
  meshes.forEach((_, start) => {
    let steps = 0;
    for (let i = meshes[start].parent; i !== null; i = meshes[i].parent) {
      if (i === start || ++steps > meshes.length) {
        throw new SceneFileError(`meshes[${start}]: parent가 순환합니다.`);
      }
    }
  });
}

/** 조명 값. 빠진 값은 그 종류의 기본값 */
function parseLight(
  value: unknown,
  kind: LightKind,
  where: string,
): LightValues {
  if (value === undefined || value === null) return { ...LIGHT_DEFAULTS[kind] };
  if (!isRecord(value)) {
    throw new SceneFileError(`${where}: light는 객체여야 합니다.`);
  }
  const defaults = LIGHT_DEFAULTS[kind];
  const {
    color = defaults.color,
    intensity = defaults.intensity,
    range = defaults.range,
    angle = defaults.angle,
    shadows = defaults.shadows,
  } = value;
  if (!isHexColor(color)) {
    throw new SceneFileError(`${where}: light.color는 "#RRGGBB"여야 합니다.`);
  }
  const limits = {
    intensity: [LIGHT_RANGES.intensity.min, Infinity],
    range: [LIGHT_RANGES.range.min, LIGHT_RANGES.range.max],
    angle: [LIGHT_RANGES.angle.min, LIGHT_RANGES.angle.max],
  } as const;
  for (const [key, number] of Object.entries({ intensity, range, angle })) {
    const [min, max] = limits[key as keyof typeof limits];
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number < min ||
      number > max
    ) {
      throw new SceneFileError(
        `${where}: light.${key}는 ${min}${max === Infinity ? " 이상" : `~${max} 사이`} 숫자여야 합니다.`,
      );
    }
  }
  if (typeof shadows !== "boolean") {
    throw new SceneFileError(
      `${where}: light.shadows는 true 또는 false여야 합니다.`,
    );
  }
  return {
    color: color as string,
    intensity: intensity as number,
    range: range as number,
    angle: angle as number,
    shadows,
  };
}

/** v4 이하에는 없다. 빠진 키는 기본값 */
function parseShape(
  value: unknown,
  preset: MeshPreset,
  where: string,
): ShapeParams {
  if (value === undefined) return shapeParamsOf(preset);
  if (!isRecord(value)) {
    throw new SceneFileError(`${where}: shape는 객체여야 합니다.`);
  }
  for (const [key, number] of Object.entries(value)) {
    const param = preset.params.find((def) => def.key === key);
    if (!param) {
      throw new SceneFileError(
        `${where}: ${preset.label}에는 shape.${key}가 없습니다.`,
      );
    }
    if (
      typeof number !== "number" ||
      number < param.min ||
      number > param.max ||
      (param.integer && !Number.isInteger(number))
    ) {
      throw new SceneFileError(
        `${where}: shape.${key}는 ${param.min}~${param.max} 사이${param.integer ? " 정수" : " 숫자"}여야 합니다.`,
      );
    }
  }
  return shapeParamsOf(preset, value as ShapeParams);
}

const TONE_MAPPING_IDS = new Set<string>(TONE_MAPPINGS.map(({ id }) => id));

/** v3 이하에는 없다. 빠진 값은 기본값 */
function parseSettings(value: unknown): SceneSettings {
  if (value === undefined) return { ...DEFAULT_SCENE_SETTINGS };
  if (!isRecord(value)) {
    throw new SceneFileError("settings는 객체여야 합니다.");
  }
  const {
    background = DEFAULT_SCENE_SETTINGS.background,
    ambientIntensity = DEFAULT_SCENE_SETTINGS.ambientIntensity,
    environmentIntensity = DEFAULT_SCENE_SETTINGS.environmentIntensity,
    exposure = DEFAULT_SCENE_SETTINGS.exposure,
    toneMapping = DEFAULT_SCENE_SETTINGS.toneMapping,
  } = value;
  if (!isHexColor(background)) {
    throw new SceneFileError('settings.background는 "#RRGGBB"여야 합니다.');
  }
  for (const [key, number] of Object.entries({
    ambientIntensity,
    environmentIntensity,
    exposure,
  })) {
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0) {
      throw new SceneFileError(`settings.${key}는 0 이상의 숫자여야 합니다.`);
    }
  }
  if (typeof toneMapping !== "string" || !TONE_MAPPING_IDS.has(toneMapping)) {
    throw new SceneFileError(
      `settings.toneMapping은 ${[...TONE_MAPPING_IDS].join(", ")} 중 하나여야 합니다.`,
    );
  }
  return {
    background,
    ambientIntensity: ambientIntensity as number,
    environmentIntensity: environmentIntensity as number,
    exposure: exposure as number,
    toneMapping: toneMapping as SceneSettings["toneMapping"],
  };
}

/** 파일 텍스트를 검사해 SceneFileData로 만든다. 잘못된 파일이면 SceneFileError */
export function parseSceneFile(text: string): SceneFileData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SceneFileError("JSON 형식이 아닙니다.");
  }

  if (!isRecord(data) || data.format !== SCENE_FILE_FORMAT) {
    throw new SceneFileError("이 에디터의 씬 파일이 아닙니다.");
  }
  if (typeof data.version !== "number" || !Number.isInteger(data.version)) {
    throw new SceneFileError("version이 없습니다.");
  }
  if (data.version < 1) {
    throw new SceneFileError(`잘못된 version(${data.version})입니다.`);
  }
  if (data.version > SCENE_FILE_VERSION) {
    throw new SceneFileError(
      `더 새로운 버전(v${data.version})의 파일입니다. 에디터를 업데이트하세요.`,
    );
  }
  if (!Array.isArray(data.meshes)) {
    throw new SceneFileError("meshes 배열이 없습니다.");
  }

  const assets = parseAssets(data.assets);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const materials = parseMaterials(data.materials, assetById);
  const materialIds = new Set(materials.map(({ id }) => id));
  const count = data.meshes.length;
  const meshes = data.meshes.map((mesh, index) =>
    parseMesh(
      mesh,
      index,
      data.version as number,
      count,
      assetById,
      materialIds,
    ),
  );
  checkParentCycles(meshes);
  return {
    format: SCENE_FILE_FORMAT,
    version: SCENE_FILE_VERSION,
    settings: parseSettings(data.settings),
    assets,
    materials,
    meshes,
  };
}

/**
 * 씬의 에디터 메쉬를 모두 해제한다 (새 씬·열기 전용).
 * 히스토리를 비운 뒤에만 부른다 — 이 메쉬들을 가리키는 Command가 남아 있으면 안 된다.
 */
export function clearEditorMeshes(scene: Scene) {
  // 부모를 해제하면 자식도 함께 해제된다
  for (const mesh of getEditorMeshes(scene)) {
    if (!mesh.isDisposed()) disposeEditorObject(mesh);
  }
  resetMeshNames(scene);
  // 공유 머티리얼도 새 씬의 것만 (쓰던 메쉬는 위에서 다 해제됐다)
  getMaterialLibrary(scene)?.clear();
}

/** 파일 내용으로 씬 설정을 바꾸고 메쉬를 만든다 (비어 있는 씬에 부른다). 히스토리에는 기록하지 않는다. */
export function loadSceneFile(scene: Scene, file: SceneFileData) {
  applySceneSettings(scene, file.settings);
  // 공유 머티리얼은 저장된 id·이름 그대로 목록에 넣는다
  const library = getMaterialLibrary(scene);
  const shared = new Map(
    file.materials.flatMap(({ id, name, material }) => {
      if (!library) return [];
      const entry = library.create(material, { id, name });
      library.add(id);
      return [[id, entry.material] as const];
    }),
  );
  const created = file.meshes.map((entry) => {
    const preset = findPreset(entry.presetId);
    if (!preset) {
      // parseSceneFile·loadSceneAssets가 미리 거른다 — 여기까지 오면 에셋 저장소와 어긋난 것이라
      // 조용히 빼지 않고(자식이 최상위로 올라가 자리가 바뀐다) 실패로 알린다
      throw new Error(`프리셋 "${entry.presetId}"을(를) 찾을 수 없습니다.`);
    }
    const mesh = addPresetObject(scene, preset, entry);
    mesh.position = Vector3.FromArray(entry.position);
    mesh.rotationQuaternion = null;
    mesh.rotation = Vector3.FromArray(entry.rotation).scaleInPlace(1 / DEGREES);
    mesh.scaling = Vector3.FromArray(entry.scaling);
    const material = entry.materialRef && shared.get(entry.materialRef);
    if (material) linkMaterial(mesh, material);
    return mesh;
  });
  // 숨김·잠금은 종류마다 한 번에 — 메쉬마다 알리면 개수를 세는 구독자가 숨긴 메쉬 수 × 전체를 훑는다
  for (const flag of ["hidden", "locked"] as const) {
    setMeshFlags(
      created.filter((_, index) => file.meshes[index][flag]),
      flag,
      true,
    );
  }
  // 값은 이미 부모 기준이라 부모만 잇는다 (부모가 뒤에 나와도 되게 다 만든 뒤에)
  file.meshes.forEach((entry, index) => {
    const mesh = created[index];
    const parent = entry.parent === null ? null : created[entry.parent];
    if (mesh && parent) setMeshParent(mesh, parent);
  });
}
