import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { createKeyedListeners } from "@/lib/listeners";

import type { Command } from "./history";

/*
 * 에디터 메쉬의 머티리얼 (PBR metallic-roughness 하나만 지원 — glTF와 같은 방식).
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
};

export const DEFAULT_METALLIC = 0;
export const DEFAULT_ROUGHNESS = 0.5;

/** 새 메쉬 기본값: 랜덤 색의 무광 플라스틱 느낌 */
export function randomMaterialValues(): MaterialValues {
  return {
    color: Color3.FromHSV(Math.random() * 360, 0.5, 0.9).toHexString(),
    metallic: DEFAULT_METALLIC,
    roughness: DEFAULT_ROUGHNESS,
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
    a.roughness === b.roughness
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
