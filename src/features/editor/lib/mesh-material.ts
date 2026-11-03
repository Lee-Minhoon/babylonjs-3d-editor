import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { createKeyedListeners } from "@/lib/listeners";

import type { Command } from "./history";

/*
 * 에디터 메쉬의 머티리얼 (PBR metallic-roughness 하나만 지원 — glTF와 같은 방식).
 * 기본색·메탈릭·거칠기에 발광색·불투명도·조명 무시를 더한다 (모두 glTF로 내보낼 수 있는 값).
 * 메쉬마다 머티리얼을 하나씩 가진다 (공유 머티리얼 없음).
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
};

/** 색 외의 기본값 (새 메쉬, 이 값이 없는 이전 버전 파일) */
export const MATERIAL_DEFAULTS = {
  metallic: 0,
  roughness: 0.5,
  emissive: "#000000",
  alpha: 1,
  unlit: false,
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
const materialChanged = createKeyedListeners<AbstractMesh>();

function getPBRMaterial(mesh: AbstractMesh): PBRMaterial | null {
  return mesh.material instanceof PBRMaterial ? mesh.material : null;
}

export function createMeshMaterial(
  name: string,
  scene: Scene,
  values: MaterialValues,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  setValues(material, values);
  return material;
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
  appliedValues.set(material, { ...values });
}

/** 에디터 메쉬의 머티리얼 값. PBR 머티리얼이 아니면 null */
export function getMaterialValues(mesh: AbstractMesh): MaterialValues | null {
  const material = getPBRMaterial(mesh);
  const values = material && appliedValues.get(material);
  return values ? { ...values } : null;
}

export function applyMaterialValues(
  mesh: AbstractMesh,
  values: MaterialValues,
) {
  const material = getPBRMaterial(mesh);
  if (!material) return;
  setValues(material, values);
  materialChanged.emit(mesh);
}

/** 이 메쉬의 머티리얼 값이 바뀌면 호출된다 */
export const onMaterialChange = materialChanged.subscribe;

export function isSameMaterial(a: MaterialValues, b: MaterialValues): boolean {
  return (
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.metallic === b.metallic &&
    a.roughness === b.roughness &&
    a.emissive.toLowerCase() === b.emissive.toLowerCase() &&
    a.alpha === b.alpha &&
    a.unlit === b.unlit
  );
}

/** 편집 한 번(색 고르기·슬라이더 놓기) = Command 하나 */
export function createMaterialCommand(
  mesh: AbstractMesh,
  before: MaterialValues,
  after: MaterialValues,
): Command {
  return {
    label: `${mesh.name} 머티리얼`,
    execute: () => applyMaterialValues(mesh, after),
    undo: () => applyMaterialValues(mesh, before),
  };
}
