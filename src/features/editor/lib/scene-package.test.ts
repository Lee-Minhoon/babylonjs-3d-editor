import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";

import { createAssetStore, MODEL_MIME_TYPE } from "./asset-store";
import { SceneFileError } from "./scene-format";
import {
  assetEntry,
  isZip,
  loadSceneAssets,
  packScene,
  readSceneBytes,
  SCENE_ENTRY,
} from "./scene-package";
import { createTestScene, fakeModelLoader } from "./test-scene";

const scene = createTestScene();

describe("씬 묶음 파일 (.zip)", () => {
  test("scene.json과 assets/<id>.<확장자>를 담고 그대로 풀린다", async () => {
    const assets = createAssetStore(scene, { loadModel: fakeModelLoader });
    const chair = await assets.add({
      name: "chair.glb",
      type: "model",
      mimeType: MODEL_MIME_TYPE,
      bytes: new Uint8Array([1, 2, 3]),
    });
    const zip = packScene('{"meshes":[]}', [chair]);
    expect(isZip(zip)).toBe(true);

    const { text, files } = readSceneBytes(zip);
    expect(text).toBe('{"meshes":[]}');
    expect([...files.keys()]).toEqual([SCENE_ENTRY, `assets/${chair.id}.glb`]);
    expect([...files.get(assetEntry(chair))!]).toEqual([1, 2, 3]);
    assets.dispose();
  });

  test(".json 바이트는 텍스트 그대로", () => {
    const { text, files } = readSceneBytes(new TextEncoder().encode("{}"));
    expect(text).toBe("{}");
    expect(files.size).toBe(0);
  });

  test("scene.json이 없거나 깨진 zip은 SceneFileError", () => {
    const other = zipSync({ "other.json": strToU8("{}") });
    expect(() => readSceneBytes(other)).toThrow("scene.json가 없습니다");
    const broken = packScene("{}", []).slice(0, 30);
    expect(() => readSceneBytes(broken)).toThrow(SceneFileError);
  });

  test("에셋이 빠졌거나 내용이 id와 다르면 SceneFileError (이미 저장소에 있으면 그것을 쓴다)", async () => {
    const assets = createAssetStore(scene, { loadModel: fakeModelLoader });
    const listed = {
      id: "0123456789abcdef",
      name: "chair.glb",
      type: "model" as const,
      mimeType: MODEL_MIME_TYPE,
    };
    await expect(loadSceneAssets(assets, [listed], new Map())).rejects.toThrow(
      "파일에 없습니다",
    );
    await expect(
      loadSceneAssets(
        assets,
        [listed],
        new Map([[assetEntry(listed), new Uint8Array([9])]]),
      ),
    ).rejects.toThrow("내용이 다릅니다");

    const real = await assets.add({ ...listed, bytes: new Uint8Array([5]) });
    await expect(
      loadSceneAssets(assets, [{ ...listed, id: real.id }], new Map()),
    ).resolves.toBeUndefined();
    assets.dispose();
  });
});
