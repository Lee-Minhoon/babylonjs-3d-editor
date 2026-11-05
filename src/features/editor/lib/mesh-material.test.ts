import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { describe, expect, test, vi } from "vitest";

import { createAssetStore } from "./asset-store";
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

describe("텍스처", () => {
  async function setup() {
    const assets = createAssetStore(scene);
    const image = (bytes: number[], name: string) =>
      assets.add({
        name,
        type: "image",
        mimeType: "image/png",
        bytes: new Uint8Array(bytes),
      });
    return {
      assets,
      wood: await image([1], "wood.png"),
      bumps: await image([2], "bumps.png"),
    };
  }

  test("에셋 id로 텍스처를 붙이고, 같은 에셋이면 그대로·바꾸거나 비우면 이전 것을 해제한다", async () => {
    const { assets, wood, bumps } = await setup();
    const mesh = createBox();
    const material = mesh.material as PBRMaterial;

    applyMaterialValues(mesh, { ...gold, colorMap: wood.id, uvScale: 3 });
    const albedo = material.albedoTexture as Texture;
    expect(albedo.url).toBe(assets.getUrl(wood.id));
    expect([albedo.uScale, albedo.vScale]).toEqual([3, 3]);

    // 다른 값만 바꾸면 텍스처는 그대로 (반복만 따라간다)
    applyMaterialValues(mesh, { ...gold, colorMap: wood.id, uvScale: 2 });
    expect(material.albedoTexture).toBe(albedo);
    expect(albedo.uScale).toBe(2);

    const dispose = vi.spyOn(albedo, "dispose");
    applyMaterialValues(mesh, {
      ...gold,
      colorMap: bumps.id,
      normalMap: bumps.id,
      roughnessMap: wood.id,
    });
    expect(dispose).toHaveBeenCalled();
    expect((material.albedoTexture as Texture).url).toBe(
      assets.getUrl(bumps.id),
    );
    expect(material.bumpTexture).toBeInstanceOf(Texture);
    expect(material.metallicTexture).toBeInstanceOf(Texture);
    // glTF처럼 G = 거칠기, B = 메탈릭
    expect(material.useRoughnessFromMetallicTextureGreen).toBe(true);
    expect(material.useMetallnessFromMetallicTextureBlue).toBe(true);

    applyMaterialValues(mesh, gold);
    expect(material.albedoTexture).toBeNull();
    expect(material.bumpTexture).toBeNull();
    expect(getMaterialValues(mesh)).toEqual(gold);
    assets.dispose();
  });

  test("Command undo로 텍스처도 돌아온다", async () => {
    const { assets, wood } = await setup();
    const mesh = createBox();
    const before = getMaterialValues(mesh)!;
    const command = createMaterialCommand(mesh, before, {
      ...before,
      colorMap: wood.id,
    });
    command.execute();
    expect((mesh.material as PBRMaterial).albedoTexture).not.toBeNull();
    command.undo();
    expect((mesh.material as PBRMaterial).albedoTexture).toBeNull();
    expect(isSameMaterial(getMaterialValues(mesh)!, before)).toBe(true);
    assets.dispose();
  });
});
