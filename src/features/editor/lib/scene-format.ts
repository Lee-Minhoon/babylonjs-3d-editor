import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { FileTypeOptions } from "@/lib/file-access";

import { captureMeshSnapshot } from "./clipboard";
import {
  addPresetObject,
  LIGHT_DEFAULTS,
  LIGHT_RANGES,
  type LightValues,
} from "./editor-lights";
import { getMeshFlag, setMeshFlag } from "./mesh-flags";
import { MATERIAL_DEFAULTS, type MaterialValues } from "./mesh-material";
import {
  ALL_PRESETS,
  findPreset,
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

/*
 * 씬 파일(.json) 형식. 에디터 메쉬는 모두 프리셋으로 만들어지므로
 * "어떤 프리셋을 어떤 변형·머티리얼로 놓았는지"만 저장한다 (정점 데이터·카메라·바닥은 저장하지 않음).
 *
 *   {
 *     "format": "babylonjs-3d-editor/scene",
 *     "version": 5,
 *     "settings": { "background": "#1A1A1F", "ambientIntensity": 1, "environmentIntensity": 1,
 *       "exposure": 1, "toneMapping": "none" },
 *     "meshes": [
 *       { "presetId": "box", "name": "Box 1", "position": [0, 0.5, 0],
 *         "rotation": [0, 45, 0], "scaling": [1, 1, 1],
 *         "material": { "color": "#4F8EF7", "metallic": 0, "roughness": 0.5,
 *           "emissive": "#000000", "alpha": 1, "unlit": false },
 *         "hidden": false, "locked": false, "shape": {}, "light": null },
 *       { "presetId": "point-light", "name": "Point Light 1", …, "material": null,
 *         "light": { "color": "#FFFFFF", "intensity": 10, "range": 10, "angle": 60, "shadows": false } }
 *     ]
 *   }
 *
 * settings는 씬 환경 설정 (scene-settings). 없거나 빠진 값은 기본값.
 * rotation은 도(°) 단위 오일러 각 (속성 패널과 같음).
 * material은 PBR metallic-roughness (color·emissive는 sRGB), 없으면 null (열 때 랜덤 색).
 * emissive·alpha·unlit이 빠져 있으면 기본값 (발광 없음·불투명·조명 받음).
 * hidden·locked는 숨기기·잠금 (mesh-flags). 없으면 false.
 * shape는 프리셋 모양 값 (MeshPreset.params, 예: 원뿔 { "diameterTop": 0, "diameterBottom": 1, "tessellation": 24 }).
 * 빠진 키는 기본값, 범위 밖이나 그 프리셋에 없는 키는 오류.
 * 조명(presetId가 *-light)은 light 값을 가진다 (빠진 값은 그 종류의 기본값). 메쉬는 light가 null.
 *
 * 버전 기록:
 *   v1  "color": "#RRGGBB" | null (StandardMaterial diffuse) → v2에서 material.color로 옮기고
 *       metallic·roughness는 기본값
 *   v2  hidden·locked 없음 → v3에서 false
 *   v3  settings·material.emissive/alpha/unlit 없음 → v4에서 기본값
 *   v4  shape 없음 → v5에서 기본 모양 (지금까지 만든 모양과 같다)
 *   v5  조명 객체·light·settings.ambientIntensity 없음 → v6 (조명 없음, 기본 조명 세기 1)
 * 형식을 바꿀 땐 SCENE_FILE_VERSION을 올리고 parseSceneFile에서 이전 버전을 변환한다.
 * 메쉬에 새 속성을 추가하면 MeshSnapshot과 함께 여기도 넣어야 저장된다.
 */

export const SCENE_FILE_FORMAT = "babylonjs-3d-editor/scene";
export const SCENE_FILE_VERSION = 6;

export const SCENE_FILE_TYPE: FileTypeOptions = {
  description: "씬 파일",
  mimeType: "application/json",
  extension: ".json",
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
};

export type SceneFileData = {
  format: typeof SCENE_FILE_FORMAT;
  version: typeof SCENE_FILE_VERSION;
  settings: SceneSettings;
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

export function serializeScene(scene: Scene): SceneFileData {
  const meshes = getEditorMeshes(scene).flatMap((mesh): SceneFileMesh[] => {
    const snapshot = captureMeshSnapshot(mesh);
    if (!snapshot) return [];
    const { transform } = snapshot;
    // 회전 기즈모를 쓰면 rotationQuaternion이 생긴다 → 오일러로 바꿔 저장
    const rotation =
      transform.rotationQuaternion?.toEulerAngles() ?? transform.rotation;
    return [
      {
        presetId: snapshot.presetId,
        name: mesh.name,
        position: toVec3(transform.position),
        rotation: toVec3(rotation, DEGREES),
        scaling: toVec3(transform.scaling),
        material: snapshot.material && {
          ...snapshot.material,
          color: snapshot.material.color.toUpperCase(),
          emissive: snapshot.material.emissive.toUpperCase(),
        },
        hidden: getMeshFlag(mesh, "hidden"),
        locked: getMeshFlag(mesh, "locked"),
        shape: snapshot.shape,
        light: snapshot.light && {
          ...snapshot.light,
          color: snapshot.light.color.toUpperCase(),
        },
      },
    ];
  });
  const settings = getSceneSettings(scene);
  return {
    format: SCENE_FILE_FORMAT,
    version: SCENE_FILE_VERSION,
    settings: { ...settings, background: settings.background.toUpperCase() },
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

function parseMaterial(value: unknown, where: string): MaterialValues | null {
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
  return {
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

function parseMesh(
  value: unknown,
  index: number,
  version: number,
): SceneFileMesh {
  const where = `meshes[${index}]`;
  if (!isRecord(value)) throw new SceneFileError(`${where}가 객체가 아닙니다.`);
  const { presetId, name, position, rotation, scaling } = value;

  if (typeof presetId !== "string" || !PRESET_IDS.has(presetId)) {
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
  const material =
    version === 1
      ? parseV1Color(value.color, where)
      : parseMaterial(value.material ?? null, where);
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

  const preset = findPreset(presetId as MeshPresetId)!;

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
  };
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

  return {
    format: SCENE_FILE_FORMAT,
    version: SCENE_FILE_VERSION,
    settings: parseSettings(data.settings),
    meshes: data.meshes.map((mesh, index) =>
      parseMesh(mesh, index, data.version as number),
    ),
  };
}

/**
 * 씬의 에디터 메쉬를 모두 해제한다 (새 씬·열기 전용).
 * 히스토리를 비운 뒤에만 부른다 — 이 메쉬들을 가리키는 Command가 남아 있으면 안 된다.
 */
export function clearEditorMeshes(scene: Scene) {
  for (const mesh of getEditorMeshes(scene)) mesh.dispose(false, true);
  resetMeshNames(scene);
}

/** 파일 내용으로 씬 설정을 바꾸고 메쉬를 만든다 (비어 있는 씬에 부른다). 히스토리에는 기록하지 않는다. */
export function loadSceneFile(scene: Scene, file: SceneFileData) {
  applySceneSettings(scene, file.settings);
  for (const entry of file.meshes) {
    const preset = findPreset(entry.presetId);
    if (!preset) continue;
    const mesh = addPresetObject(scene, preset, entry);
    mesh.position = Vector3.FromArray(entry.position);
    mesh.rotationQuaternion = null;
    mesh.rotation = Vector3.FromArray(entry.rotation).scaleInPlace(1 / DEGREES);
    mesh.scaling = Vector3.FromArray(entry.scaling);
    setMeshFlag(mesh, "hidden", entry.hidden);
    setMeshFlag(mesh, "locked", entry.locked);
  }
}
