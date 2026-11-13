import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from "fflate";

import { type Asset, assetExtension, type AssetStore } from "./asset-store";
import { type SceneFileAsset, SceneFileError } from "./scene-format";

/*
 * 씬 묶음 파일 (.zip): 씬 파일 텍스트(scene.json)와 그 씬이 쓰는 에셋 바이트(assets/<id>.<확장자>).
 *   my-scene.zip
 *   ├── scene.json        (scene-format — assets 목록에 id·이름·종류)
 *   └── assets/
 *       ├── 3f2a9c….glb
 *       └── 81be04….png
 * 에셋이 없는 씬은 지금처럼 .json 하나로 저장한다 (scene-file이 고른다).
 * GLB·PNG·JPEG는 이미 압축돼 있어 다시 압축하지 않는다 (저장만).
 */

export const SCENE_ENTRY = "scene.json";

export const assetEntry = (asset: Pick<Asset, "id" | "mimeType">) =>
  `assets/${asset.id}${assetExtension(asset.mimeType)}`;

export function packScene(text: string, assets: readonly Asset[]): Uint8Array {
  const files: Zippable = { [SCENE_ENTRY]: strToU8(text) };
  for (const asset of assets) {
    files[assetEntry(asset)] = [asset.bytes, { level: 0 }];
  }
  return zipSync(files);
}

/** zip 파일인가 (앞 4바이트 "PK\x03\x04") */
export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export type UnpackedScene = {
  text: string;
  /** 묶음 안의 파일들 (경로 → 바이트) */
  files: ReadonlyMap<string, Uint8Array>;
};

export function unpackScene(bytes: Uint8Array): UnpackedScene {
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new SceneFileError("zip 파일을 풀 수 없습니다.");
  }
  const scene = entries[SCENE_ENTRY];
  if (!scene) {
    throw new SceneFileError(`묶음 파일에 ${SCENE_ENTRY}가 없습니다.`);
  }
  return {
    text: strFromU8(scene),
    files: new Map(Object.entries(entries)),
  };
}

/** 파일 바이트 → 씬 텍스트와 묶음 안의 파일들 (.json이면 파일 없음) */
export function readSceneBytes(bytes: Uint8Array): UnpackedScene {
  if (isZip(bytes)) return unpackScene(bytes);
  return { text: new TextDecoder().decode(bytes), files: new Map() };
}

/**
 * 씬 파일이 쓰는 에셋을 저장소에 넣는다 (모델은 불러오기까지). 묶음에 없더라도 이미 저장소에 있으면 그것을 쓴다.
 * 빠졌거나 내용이 id(해시)와 다르거나 불러올 수 없으면 SceneFileError — 씬을 바꾸기 전에 부른다.
 */
export async function loadSceneAssets(
  store: AssetStore,
  assets: readonly SceneFileAsset[],
  files: ReadonlyMap<string, Uint8Array>,
) {
  await Promise.all(
    assets.map(async (asset) => {
      const bytes = files.get(assetEntry(asset));
      let added = store.get(asset.id);
      if (bytes) {
        try {
          added = await store.add({ ...asset, bytes });
        } catch (error) {
          throw new SceneFileError(
            `"${asset.name}"을(를) 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (added.id !== asset.id) {
          throw new SceneFileError(`에셋 "${asset.name}"의 내용이 다릅니다.`);
        }
      } else if (!added) {
        throw new SceneFileError(`에셋 "${asset.name}"이(가) 파일에 없습니다.`);
      }
      // 같은 바이트가 다른 종류로 이미 들어와 있으면(이미지를 모델이라고 적은 파일) 모델 프리셋이 없어
      // 메쉬를 만들 수 없다 — 씬을 바꾸기 전에 거른다
      if (added.type !== asset.type) {
        throw new SceneFileError(
          `에셋 "${asset.name}"의 종류(${asset.type})가 이미 불러온 것(${added.type})과 다릅니다.`,
        );
      }
    }),
  );
}
