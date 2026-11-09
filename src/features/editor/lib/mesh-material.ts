import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { getAssetStore } from "./asset-registry";
import { createMeshProperty } from "./editable-property";

/*
 * 에디터 메쉬의 머티리얼 (PBR metallic-roughness 하나만 지원 — glTF와 같은 방식).
 * 기본색·메탈릭·거칠기에 발광색·불투명도·조명 무시를 더한다 (모두 glTF로 내보낼 수 있는 값).
 * 텍스처는 이미지 에셋 id로 가리킨다 (asset-store가 바이트·주소를 갖고, 파일에는 묶음 .zip으로 들어간다).
 *   기본색 맵(값에 기본색이 곱해짐) · 노멀 맵 · 거칠기·메탈릭 맵(glTF 방식: G = 거칠기, B = 메탈릭, 값이 곱해짐).
 *   UV는 프리셋 메쉬의 기본 UV이고 uvScale만큼 반복한다.
 * 메쉬마다 전용 머티리얼을 하나씩 갖거나, 공유 머티리얼 라이브러리(material-library)의 것을 같이 쓴다.
 * 공유 머티리얼을 고치면 그것을 쓰는 메쉬가 모두 바뀌고 모두에게 알린다 (related).
 *
 * 값을 바꾸는 곳(미리보기·Command·파일 열기)은 모두 applyMaterialValues를 거친다
 * → 속성 패널은 onMaterialChange 하나만 구독하면 어디서 바뀌든 반영된다.
 * 메쉬에 새 머티리얼 속성을 추가하면 MaterialValues에 넣는다 (복사·파일 저장이 따라온다).
 */

export type MaterialValues = {
  /** 기본색(albedo), sRGB "#RRGGBB". 머티리얼에는 선형 공간으로 바꿔 넣는다. */
  color: string;
  /** 0 = 비금속, 1 = 금속 */
  metallic: number;
  /** 0 = 거울처럼 매끈, 1 = 무광 */
  roughness: number;
  /** 발광색 (조명과 무관하게 더해지는 빛), sRGB "#RRGGBB". 검정이면 발광 없음 */
  emissive: string;
  /** 불투명도. 1 = 불투명, 1보다 작으면 알파 블렌드로 그린다 */
  alpha: number;
  /** 조명 무시: 조명·환경과 상관없이 기본색 그대로 보인다 (glTF KHR_materials_unlit) */
  unlit: boolean;
  /** 기본색 텍스처 (이미지 에셋 id). 기본색이 곱해진다 — 흰색이면 이미지 그대로 */
  colorMap: string | null;
  /** 노멀 맵 (이미지 에셋 id) */
  normalMap: string | null;
  /** 거칠기·메탈릭 맵 (이미지 에셋 id). G 채널 = 거칠기, B 채널 = 메탈릭 (glTF metallicRoughness) */
  roughnessMap: string | null;
  /** 텍스처 반복 횟수 (UV 배율). 1 = 면마다 한 번 */
  uvScale: number;
};

/** 텍스처 칸 (속성 패널·파일 검증이 같이 쓴다) */
export const TEXTURE_SLOTS = [
  { key: "colorMap", label: "기본색 맵" },
  { key: "normalMap", label: "노멀 맵" },
  { key: "roughnessMap", label: "거칠기·메탈릭 맵" },
] as const satisfies readonly { key: keyof MaterialValues; label: string }[];

export type TextureSlot = (typeof TEXTURE_SLOTS)[number]["key"];

/** 텍스처 반복 범위 (속성 패널 슬라이더·파일 검증) */
export const UV_SCALE_RANGE = { min: 0.1, max: 20, step: 0.1 } as const;

/**
 * 여러 메쉬가 같이 쓰는 머티리얼 (가져온 모델의 glTF 머티리얼 등). 메쉬를 해제할 때 함께 해제하면 안 된다
 * — mesh-commands의 disposeEditorObject가 이 표시를 보고 떼어 낸 뒤 해제한다.
 */
const sharedMaterials = new WeakSet<Material>();

export function markSharedMaterial(material: Material) {
  sharedMaterials.add(material);
}

export function isSharedMaterial(material: Material | null): boolean {
  return material !== null && sharedMaterials.has(material);
}

/** 색 외의 기본값 (새 메쉬, 이 값이 없는 이전 버전 파일) */
export const MATERIAL_DEFAULTS = {
  metallic: 0,
  roughness: 0.5,
  emissive: "#000000",
  alpha: 1,
  unlit: false,
  colorMap: null,
  normalMap: null,
  roughnessMap: null,
  uvScale: 1,
} as const satisfies Omit<MaterialValues, "color">;

/** 새 메쉬 기본값: 랜덤 색의 무광 플라스틱 느낌 */
export function randomMaterialValues(): MaterialValues {
  return {
    color: Color3.FromHSV(Math.random() * 360, 0.5, 0.9).toHexString(),
    ...MATERIAL_DEFAULTS,
  };
}

/**
 * 머티리얼에 적용한 값. 선형 ↔ sRGB 변환을 왕복하면 색이 한 단계씩 어긋날 수 있어서
 * 머티리얼에서 다시 계산하지 않고 적용한 값을 그대로 기억한다.
 */
const appliedValues = new WeakMap<PBRMaterial, MaterialValues>();

function getPBRMaterial(mesh: AbstractMesh): PBRMaterial | null {
  return mesh.material instanceof PBRMaterial ? mesh.material : null;
}

export function createMeshMaterial(
  name: string,
  scene: Scene,
  values: MaterialValues,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  // 아직 그려진 적 없는 머티리얼이라 "다시 컴파일" 표시가 필요 없다. 막지 않으면 기본값과 다른 속성
  // (투명 모드·거칠기 채널…)을 바꿀 때마다 씬의 모든 메쉬를 훑어서, 메쉬 N개를 만들면 O(N²)이 된다
  // (1만 개 씬 열기 18초). 공개 setter로 풀면 그때 한 번 훑으므로 내부 값을 직접 되돌린다.
  material.blockDirtyMechanism = true;
  setValues(material, values);
  (
    material as unknown as { _blockDirtyMechanism: boolean }
  )._blockDirtyMechanism = false;
  return material;
}

/** 텍스처가 가리키는 이미지 에셋 id (같은 에셋이면 텍스처를 다시 만들지 않는다) */
const textureAssets = new WeakMap<Texture, string>();

const TEXTURE_PROPERTIES = {
  colorMap: "albedoTexture",
  normalMap: "bumpTexture",
  roughnessMap: "metallicTexture",
} as const satisfies Record<TextureSlot, keyof PBRMaterial>;

/** 칸의 텍스처를 에셋 id에 맞춘다. 저장소에 없는 에셋이면 비운다 (머티리얼 값에는 id가 남는다) */
function setTexture(
  material: PBRMaterial,
  slot: TextureSlot,
  assetId: string | null,
  uvScale: number,
) {
  const property = TEXTURE_PROPERTIES[slot];
  const current = material[property];
  const currentId =
    current instanceof Texture ? textureAssets.get(current) : null;
  if ((currentId ?? null) !== assetId) {
    // 텍스처는 머티리얼마다 따로 (같은 주소면 엔진이 이미지는 공유한다)
    current?.dispose();
    const scene = material.getScene();
    const url = assetId && getAssetStore(scene)?.getUrl(assetId);
    let texture: Texture | null = null;
    if (url) {
      texture = new Texture(url, scene);
      textureAssets.set(texture, assetId);
    }
    material[property] = texture;
  }
  const texture = material[property];
  if (texture instanceof Texture) texture.uScale = texture.vScale = uvScale;
}

function setValues(material: PBRMaterial, values: MaterialValues) {
  material.albedoColor = Color3.FromHexString(values.color).toLinearSpace();
  material.metallic = values.metallic;
  material.roughness = values.roughness;
  material.emissiveColor = Color3.FromHexString(
    values.emissive,
  ).toLinearSpace();
  material.alpha = values.alpha;
  // 반투명은 뒤에서 앞으로 정렬해 블렌드한다 (메쉬 단위 정렬이라 서로 파고든 메쉬는 순서가 어긋날 수 있다)
  material.transparencyMode =
    values.alpha < 1
      ? PBRMaterial.PBRMATERIAL_ALPHABLEND
      : PBRMaterial.PBRMATERIAL_OPAQUE;
  material.unlit = values.unlit;
  for (const { key } of TEXTURE_SLOTS) {
    setTexture(material, key, values[key], values.uvScale);
  }
  // 거칠기·메탈릭 맵은 glTF처럼 G·B 채널을 읽는다
  material.useRoughnessFromMetallicTextureAlpha = false;
  material.useRoughnessFromMetallicTextureGreen = true;
  material.useMetallnessFromMetallicTextureBlue = true;
  appliedValues.set(material, { ...values });
}

/** 메쉬의 머티리얼 속성 (get은 PBR 머티리얼이 아니면 null). 편집 한 번(색 고르기·슬라이더 놓기) = Command 하나 */
export const materialProperty = createMeshProperty<MaterialValues>({
  verb: "머티리얼",
  read(mesh) {
    const material = getPBRMaterial(mesh);
    const values = material && appliedValues.get(material);
    return values ? { ...values } : null;
  },
  write(mesh, values) {
    const material = getPBRMaterial(mesh);
    if (material) setValues(material, values);
  },
  isSame: (a, b) =>
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.metallic === b.metallic &&
    a.roughness === b.roughness &&
    a.emissive.toLowerCase() === b.emissive.toLowerCase() &&
    a.alpha === b.alpha &&
    a.unlit === b.unlit &&
    a.colorMap === b.colorMap &&
    a.normalMap === b.normalMap &&
    a.roughnessMap === b.roughnessMap &&
    a.uvScale === b.uvScale,
  // 같이 쓰는 머티리얼이면 그것을 쓰는 다른 메쉬들의 패널도 다시 읽게
  related: (mesh) =>
    mesh.material && isSharedMaterial(mesh.material)
      ? mesh.material.getBindedMeshes()
      : [],
});

export const {
  get: getMaterialValues,
  apply: applyMaterialValues,
  onChange: onMaterialChange,
  isSame: isSameMaterial,
  createCommand: createMaterialCommand,
} = materialProperty;
