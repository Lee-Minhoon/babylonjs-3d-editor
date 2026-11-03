import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { describe, expect, test, vi } from "vitest";

import {
  applyMaterialValues,
  createMaterialCommand,
  getMaterialValues,
  isSameMaterial,
  MATERIAL_DEFAULTS,
  onMaterialChange,
} from "./mesh-material";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const gold = {
  ...MATERIAL_DEFAULTS,
  color: "#D4AF37",
  metallic: 1,
  roughness: 0.15,
};

function createBox() {
  return addPresetMesh(scene, findPreset("box")!, {
    ...MATERIAL_DEFAULTS,
    color: "#FF0000",
  });
}

describe("mesh material", () => {
  test("적용한 값을 그대로 돌려준다 (선형↔sRGB 변환 오차 없음)", () => {
    const mesh = createBox();
    applyMaterialValues(mesh, gold);
    expect(getMaterialValues(mesh)).toEqual(gold);
  });

  test("값이 바뀌면 그 메쉬의 구독자만 알림을 받는다", () => {
    const mesh = createBox();
    const other = createBox();
    const listener = vi.fn();
    const unsubscribe = onMaterialChange(mesh, listener);

    applyMaterialValues(other, gold);
    expect(listener).not.toHaveBeenCalled();
    applyMaterialValues(mesh, gold);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    applyMaterialValues(mesh, { ...gold, roughness: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("Command undo/redo", () => {
    const mesh = createBox();
    const before = getMaterialValues(mesh)!;
    const command = createMaterialCommand(mesh, before, gold);
    expect(command.label).toBe(`${mesh.name} 머티리얼`);
    command.execute();
    expect(getMaterialValues(mesh)).toEqual(gold);
    command.undo();
    expect(getMaterialValues(mesh)).toEqual(before);
  });

  test("불투명도가 1보다 작으면 알파 블렌드, 조명 무시는 unlit", () => {
    const mesh = createBox();
    const material = mesh.material as PBRMaterial;
    applyMaterialValues(mesh, { ...gold, alpha: 0.4, unlit: true });
    expect(material.alpha).toBe(0.4);
    expect(material.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
    expect(material.unlit).toBe(true);

    applyMaterialValues(mesh, gold);
    expect(material.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_OPAQUE);
    expect(material.unlit).toBe(false);
  });

  test("색 비교는 대소문자를 무시한다", () => {
    expect(isSameMaterial(gold, { ...gold, color: "#d4af37" })).toBe(true);
    expect(isSameMaterial(gold, { ...gold, metallic: 0.9 })).toBe(false);
    expect(isSameMaterial(gold, { ...gold, emissive: "#000001" })).toBe(false);
    expect(isSameMaterial(gold, { ...gold, unlit: true })).toBe(false);
  });
});
