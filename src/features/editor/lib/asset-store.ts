import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import { getSceneAssets, registerSceneAssets } from "./asset-registry";
import { markSharedMaterial } from "./mesh-material";
import {
  type MeshPreset,
  type MeshPresetId,
  registerModelPreset,
  unregisterModelPreset,
} from "./mesh-presets";
import { loadModelTemplate } from "./model-template";

/*
 * 에셋: 씬이 쓰는 바이너리 파일 (가져온 모델 GLB, 텍스처 이미지). 씬 파일(JSON)에는 id만 적고,
 * 바이트는 씬 묶음 파일(.zip)의 assets/ 폴더와 자동 저장 기록에 따로 담는다 (scene-package).
 *   - id는 내용의 해시 → 같은 파일을 다시 가져오면 같은 에셋, 다른 씬 파일에서 열어도 그대로 이어진다.
 *   - 한 번 들어온 에셋은 에디터를 닫을 때까지 남는다 (새 씬·열기에도) — undo 기록·클립보드가
 *     지운 모델이나 텍스처를 다시 쓸 수 있게. 파일에는 지금 씬이 쓰는 것만 저장한다.
 *   - 모델은 들어올 때 불러와 합친 원본 메쉬(model-template)를 만들고 "model:<id>" 프리셋으로 등록한다
 *     → 배치·복사·파일 열기가 프리셋 경로 그대로 모델 객체를 만든다 (원본을 복제, 동기).
 *   - 이미지는 object URL을 만들어 텍스처가 그 주소로 읽는다 (같은 주소면 엔진이 텍스처를 공유한다).
 */

export type AssetType = "model" | "image";

export type Asset = {
  id: string;
  /** 가져온 파일 이름 (예: "chair.glb") */
  name: string;
  type: AssetType;
  mimeType: string;
  bytes: Uint8Array;
};

export type AssetInput = Omit<Asset, "id">;

export type AssetStore = {
  /** 에셋을 넣는다 (이미 있으면 그것). 모델은 불러와 프리셋까지 등록한 뒤 끝난다 — 잘못된 파일이면 거부 */
  add(input: AssetInput): Promise<Asset>;
  get(id: string): Asset | undefined;
  list(): readonly Asset[];
  /** 이미지 에셋의 object URL (텍스처용). 없는 에셋이면 null */
  getUrl(id: string): string | null;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

/** 모델 GLB를 합친 원본 메쉬로 (테스트에서 바꿔 끼운다) */
export type ModelLoader = (
  scene: Scene,
  name: string,
  bytes: Uint8Array,
) => Promise<Mesh>;

export const MODEL_MIME_TYPE = "model/gltf-binary";

/** 묶음 파일 안의 파일 이름에 붙일 확장자 */
export function assetExtension(mimeType: string): string {
  return (
    {
      [MODEL_MIME_TYPE]: ".glb",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
    }[mimeType] ?? ""
  );
}

export const modelPresetId = (assetId: string): MeshPresetId =>
  `model:${assetId}`;

/** "chair.glb" → "chair" (모델 객체 이름 "chair 1") */
export const assetLabel = (name: string) =>
  name.replace(/\.[^.]+$/, "").trim() || "Model";

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** 모델 프리셋: 그 씬의 원본 메쉬를 복제한다 (지오메트리·머티리얼 공유 — 머티리얼은 원본 소유) */
function createModelPreset(asset: Asset): MeshPreset {
  return {
    id: modelPresetId(asset.id),
    label: assetLabel(asset.name),
    keywords: [asset.name, "모델", "model"],
    params: [],
    model: asset.id,
    create(name, scene) {
      const template = getSceneAssets(scene)?.templates.get(asset.id);
      if (!template) throw new Error(`Model not loaded: ${asset.name}`);
      const mesh = template.clone(name, null, true);
      mesh.setEnabled(true);
      return mesh;
    },
  };
}

export function createAssetStore(
  scene: Scene,
  { loadModel = loadModelTemplate }: { loadModel?: ModelLoader } = {},
): AssetStore {
  const assets = new Map<string, Asset>();
  const pending = new Map<string, Promise<Asset>>();
  const urls = new Map<string, string>();
  const templates = new Map<string, Mesh>();
  const listeners = createListeners();
  let list: readonly Asset[] = [];

  const load = async (input: AssetInput): Promise<Asset> => {
    const asset: Asset = { ...input, id: await hashBytes(input.bytes) };
    const existing = assets.get(asset.id) ?? pending.get(asset.id);
    if (existing) return existing;
    const loading = (async () => {
      if (asset.type === "model") {
        const template = await loadModel(
          scene,
          assetLabel(asset.name),
          asset.bytes,
        );
        // 복제본들이 원본의 머티리얼을 같이 쓴다 (객체를 지워도 머티리얼은 원본과 남는다)
        if (template.material) markSharedMaterial(template.material);
        templates.set(asset.id, template);
        registerModelPreset(createModelPreset(asset));
      }
      assets.set(asset.id, asset);
      list = [...assets.values()];
      listeners.emit();
      return asset;
    })().finally(() => pending.delete(asset.id));
    pending.set(asset.id, loading);
    return loading;
  };

  const store: AssetStore = {
    add: load,
    get: (id) => assets.get(id),
    list: () => list,
    getUrl(id) {
      const asset = assets.get(id);
      if (!asset) return null;
      let url = urls.get(id);
      if (!url) {
        const blob = new Blob([asset.bytes as Uint8Array<ArrayBuffer>], {
          type: asset.mimeType,
        });
        urls.set(id, (url = URL.createObjectURL(blob)));
      }
      return url;
    },
    subscribe: listeners.subscribe,
    dispose() {
      for (const [id, template] of templates) {
        unregisterModelPreset(modelPresetId(id));
        template.dispose(false, true);
      }
      for (const url of urls.values()) URL.revokeObjectURL(url);
      templates.clear();
      urls.clear();
      registerSceneAssets(scene, null);
      listeners.clear();
    },
  };
  registerSceneAssets(scene, { store, templates });
  return store;
}
