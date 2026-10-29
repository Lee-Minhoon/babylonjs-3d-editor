import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { FileTypeOptions } from "@/lib/file-access";

import { captureMeshSnapshot } from "./clipboard";
import {
  DEFAULT_METALLIC,
  DEFAULT_ROUGHNESS,
  type MaterialValues,
} from "./mesh-material";
import {
  addPresetMesh,
  findPreset,
  inCreationOrder,
  MESH_PRESETS,
  type MeshPresetId,
  resetMeshNames,
} from "./mesh-presets";

/*
 * 씬 파일(.json) 형식. 에디터 메쉬는 모두 프리셋으로 만들어지므로
 * "어떤 프리셋을 어떤 변형·머티리얼로 놓았는지"만 저장한다 (정점 데이터·카메라·바닥은 저장하지 않음).
 *
 *   {
 *     "format": "babylonjs-3d-editor/scene",
 *     "version": 2,
 *     "meshes": [
 *       { "presetId": "box", "name": "Box 1", "position": [0, 0.5, 0],
 *         "rotation": [0, 45, 0], "scaling": [1, 1, 1],
 *         "material": { "color": "#4F8EF7", "metallic": 0, "roughness": 0.5 } }
 *     ]
 *   }
 *
 * rotation은 도(°) 단위 오일러 각 (속성 패널과 같음).
 * material은 PBR metallic-roughness (color는 sRGB), 없으면 null (열 때 랜덤 색).
 *
 * 버전 기록:
 *   v1  "color": "#RRGGBB" | null (StandardMaterial diffuse) → v2에서 material.color로 옮기고
 *       metallic·roughness는 기본값
 * 형식을 바꿀 땐 SCENE_FILE_VERSION을 올리고 parseSceneFile에서 이전 버전을 변환한다.
 * 메쉬에 새 속성을 추가하면 MeshSnapshot과 함께 여기도 넣어야 저장된다.
 */

export const SCENE_FILE_FORMAT = "babylonjs-3d-editor/scene";
export const SCENE_FILE_VERSION = 2;

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
};

export type SceneFileData = {
  format: typeof SCENE_FILE_FORMAT;
  version: typeof SCENE_FILE_VERSION;
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
        },
      },
    ];
  });
  return { format: SCENE_FILE_FORMAT, version: SCENE_FILE_VERSION, meshes };
}

export function stringifySceneFile(file: SceneFileData): string {
  // [x, y, z] 숫자 배열은 한 줄로 (사람이 읽고 diff 보기 쉽게)
  const text = JSON.stringify(file, null, 2).replace(
    /\[\s+(-?[\d.e+-]+(?:,\s+-?[\d.e+-]+)*)\s+\]/g,
    (_, numbers: string) => `[${numbers.split(/,\s+/).join(", ")}]`,
  );
  return `${text}\n`;
}

const PRESET_IDS = new Set<string>(MESH_PRESETS.map((preset) => preset.id));

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
  if (!isHexColor(color)) {
    throw new SceneFileError(
      `${where}: material.color는 "#RRGGBB"여야 합니다.`,
    );
  }
  for (const [key, number] of Object.entries({ metallic, roughness })) {
    if (!isUnitNumber(number)) {
      throw new SceneFileError(
        `${where}: material.${key}는 0~1 사이 숫자여야 합니다.`,
      );
    }
  }
  return {
    color,
    metallic: metallic as number,
    roughness: roughness as number,
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
  return {
    color: value,
    metallic: DEFAULT_METALLIC,
    roughness: DEFAULT_ROUGHNESS,
  };
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

  return {
    presetId: presetId as MeshPresetId,
    name,
    position: position as Vec3,
    rotation: rotation as Vec3,
    scaling: scaling as Vec3,
    material,
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

/** 파일 내용으로 메쉬를 만든다 (비어 있는 씬에 부른다). 히스토리에는 기록하지 않는다. */
export function loadSceneFile(scene: Scene, file: SceneFileData) {
  for (const entry of file.meshes) {
    const preset = findPreset(entry.presetId);
    if (!preset) continue;
    const mesh = addPresetMesh(
      scene,
      preset,
      Vector3.Zero(),
      entry.material ?? undefined,
      entry.name,
    );
    mesh.position = Vector3.FromArray(entry.position);
    mesh.rotationQuaternion = null;
    mesh.rotation = Vector3.FromArray(entry.rotation).scaleInPlace(1 / DEGREES);
    mesh.scaling = Vector3.FromArray(entry.scaling);
  }
}
