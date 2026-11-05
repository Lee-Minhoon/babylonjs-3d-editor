import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { AssetStore } from "./asset-store";

/*
 * 씬마다 하나인 에셋 저장소를 찾는 곳. 머티리얼(텍스처 주소)·모델 프리셋(원본 복제)이 씬만 갖고 저장소를 찾는다.
 * asset-store와 나눠 둔 것은 import 순환을 피하려고 — mesh-material·mesh-presets는 이 파일만 본다.
 */

export type SceneAssets = {
  store: AssetStore;
  /** 모델 에셋 id → 합친 원본 메쉬 (씬에서 떼어 둔 것) */
  templates: Map<string, Mesh>;
};

const registry = new WeakMap<Scene, SceneAssets>();

export function registerSceneAssets(scene: Scene, assets: SceneAssets | null) {
  if (assets) registry.set(scene, assets);
  else registry.delete(scene);
}

export function getSceneAssets(scene: Scene): SceneAssets | null {
  return registry.get(scene) ?? null;
}

/** 그 씬의 에셋 저장소 (텍스처가 이미지 주소를 찾을 때). 없으면 null */
export function getAssetStore(scene: Scene): AssetStore | null {
  return registry.get(scene)?.store ?? null;
}
