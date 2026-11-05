import { afterEach, describe, expect, test, vi } from "vitest";

import { getAssetStore } from "./asset-registry";
import {
  createAssetStore,
  MODEL_MIME_TYPE,
  modelPresetId,
} from "./asset-store";
import { addPresetObject } from "./editor-lights";
import {
  createRemoveMeshCommand,
  createSpawnMeshCommand,
} from "./mesh-commands";
import { getMaterialValues } from "./mesh-material";
import { findPreset, isModelObject } from "./mesh-presets";
import { clearEditorMeshes } from "./scene-format";
import { createTestScene, fakeModelLoader } from "./test-scene";

const scene = createTestScene();
afterEach(() => clearEditorMeshes(scene));

const model = (bytes: number[], name = "chair.glb") => ({
  name,
  type: "model" as const,
  mimeType: MODEL_MIME_TYPE,
  bytes: new Uint8Array(bytes),
});

describe("에셋 저장소", () => {
  test("id는 내용 해시: 같은 파일은 한 번만 불러온다", async () => {
    const loadModel = vi.fn(fakeModelLoader);
    const assets = createAssetStore(scene, { loadModel });
    const first = await assets.add(model([1, 2, 3]));
    const again = await assets.add(model([1, 2, 3], "copy.glb"));
    const other = await assets.add(model([4, 5, 6]));

    expect(first.id).toMatch(/^[0-9a-f]{16}$/);
    expect(again).toBe(first);
    expect(other.id).not.toBe(first.id);
    expect(loadModel).toHaveBeenCalledTimes(2);
    expect(assets.list().map((asset) => asset.name)).toEqual([
      "chair.glb",
      "chair.glb",
    ]);
    expect(getAssetStore(scene)).toBe(assets);
    assets.dispose();
    expect(getAssetStore(scene)).toBeNull();
  });

  test("불러오지 못한 모델은 넣지 않는다", async () => {
    const assets = createAssetStore(scene, {
      loadModel: () => Promise.reject(new Error("glTF가 아닙니다")),
    });
    await expect(assets.add(model([9]))).rejects.toThrow("glTF가 아닙니다");
    expect(assets.list()).toEqual([]);
    assets.dispose();
  });

  test("모델은 프리셋이 되고, 객체는 원본을 복제해 머티리얼을 같이 쓴다", async () => {
    const assets = createAssetStore(scene, { loadModel: fakeModelLoader });
    const asset = await assets.add(model([7, 7]));
    const preset = findPreset(modelPresetId(asset.id))!;
    expect(preset).toMatchObject({ label: "chair", model: asset.id });

    const spawn = createSpawnMeshCommand(
      scene,
      () => addPresetObject(scene, preset),
      "추가",
      preset.label,
    );
    spawn.execute();
    const chair = spawn.getMesh()!;
    expect(chair.name).toBe("chair 1");
    expect(isModelObject(chair)).toBe(true);
    // glTF 머티리얼은 편집 대상이 아니다
    expect(getMaterialValues(chair)).toBeNull();
    const shared = chair.material!;

    // 지운 객체가 해제돼도 원본의 머티리얼은 남는다 (다음 객체가 쓴다)
    const remove = createRemoveMeshCommand(scene, chair);
    remove.execute();
    remove.dispose?.();
    expect(chair.isDisposed()).toBe(true);
    expect(scene.multiMaterials).toContain(shared);
    const next = addPresetObject(scene, preset);
    expect(next.material).toBe(shared);
    assets.dispose();
  });

  test("이미지는 object URL로 (같은 에셋이면 같은 주소)", async () => {
    const assets = createAssetStore(scene);
    const image = await assets.add({
      name: "wood.png",
      type: "image",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    });
    const url = assets.getUrl(image.id);
    expect(url).toMatch(/^blob:/);
    expect(assets.getUrl(image.id)).toBe(url);
    expect(assets.getUrl("0000000000000000")).toBeNull();
    assets.dispose();
  });
});
