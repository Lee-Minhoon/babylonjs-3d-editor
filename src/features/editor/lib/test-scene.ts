import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Scene } from "@babylonjs/core/scene";

import type { ModelLoader } from "./asset-store";
import { mergeModelParts } from "./model-template";

/** 단위 테스트용 씬 (렌더링 없음). 테스트가 끝나면 dispose 한다. */
export function createTestScene(): Scene {
  return new Scene(new NullEngine());
}

/**
 * 모델 불러오기 대신 (Node에는 glTF 로더가 쓸 이미지 디코더 등이 없다): 바이트는 보지 않고
 * 재질이 다른 상자 두 개(가로로 나란히, 폭 2)를 합친 원본을 만든다.
 */
export const fakeModelLoader: ModelLoader = async (scene, name) => {
  const parts = [-0.5, 0.5].map((x, index) => {
    const part = CreateBox(`${name} part ${index}`, { size: 1 }, scene);
    part.position.x = x;
    part.material = new PBRMaterial(`${name} material ${index}`, scene);
    return part;
  });
  const template = mergeModelParts(scene, name, parts);
  for (const part of parts) part.dispose();
  scene.removeMesh(template);
  return template;
};
