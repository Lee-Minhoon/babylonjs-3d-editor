import { type FileTypeOptions, openFile } from "@/lib/file-access";

import {
  type Asset,
  type AssetStore,
  type AssetType,
  MODEL_MIME_TYPE,
  modelPresetId,
} from "./asset-store";
import { startPresetPlacement } from "./editor-actions";
import { findPreset } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import type { SceneFileNotice } from "./scene-file";

/*
 * 에셋 가져오기 (파일 창 → 에셋 저장소).
 *   - 모델(.glb): 가져오면 바로 그 모델의 배치 모드 (프리셋처럼 클릭할 때마다 놓고 Esc로 끝).
 *     같은 모델은 ⇧A 추가 메뉴의 "모델"에도 남는다.
 *   - 이미지(PNG·JPEG·WebP): 머티리얼 텍스처 칸이 부른다 (에셋만 돌려준다).
 * 에셋을 넣는 것 자체는 씬을 바꾸지 않는다 (히스토리 없음) — 객체를 놓거나 텍스처를 고를 때 Command가 생긴다.
 */

export const MODEL_FILE_TYPE: FileTypeOptions = {
  description: "glTF 바이너리 모델",
  mimeType: MODEL_MIME_TYPE,
  extension: ".glb",
};

export const IMAGE_FILE_TYPES: readonly FileTypeOptions[] = [
  { description: "PNG 이미지", mimeType: "image/png", extension: ".png" },
  {
    description: "JPEG 이미지",
    mimeType: "image/jpeg",
    extension: ".jpg",
    otherExtensions: [".jpeg"],
  },
  { description: "WebP 이미지", mimeType: "image/webp", extension: ".webp" },
];

/** 파일 이름으로 이미지 종류 (모르면 null) */
export function imageMimeType(name: string): string | null {
  const extension = /\.[^.]+$/.exec(name.toLowerCase())?.[0];
  return (
    IMAGE_FILE_TYPES.find(
      (type) =>
        type.extension === extension ||
        type.otherExtensions?.includes(extension ?? ""),
    )?.mimeType ?? null
  );
}

export type AssetImport = {
  /** 모델 파일을 골라 가져오고 배치를 시작한다 */
  importModel(): Promise<void>;
  /** 이미지 파일을 골라 가져온다. 취소·실패면 null */
  importImage(): Promise<Asset | null>;
};

export function createAssetImport({
  assets,
  placement,
  notify,
}: {
  assets: AssetStore;
  placement: PlacementTool;
  notify: (notice: SceneFileNotice) => void;
}): AssetImport {
  /** 파일 창이 열려 있거나 불러오는 중이면 다음 요청을 무시한다 */
  let busy = false;

  const pick = async (
    types: FileTypeOptions | readonly FileTypeOptions[],
    type: AssetType,
    mimeTypeOf: (name: string) => string | null,
  ): Promise<Asset | null> => {
    if (busy) return null;
    busy = true;
    let name = "";
    try {
      const opened = await openFile(types);
      if (!opened) return null;
      name = opened.name;
      const mimeType = mimeTypeOf(opened.name);
      if (!mimeType) throw new Error("지원하지 않는 파일 형식입니다.");
      return await assets.add({
        name: opened.name,
        type,
        mimeType,
        bytes: opened.bytes,
      });
    } catch (error) {
      notify({
        type: "error",
        title: name
          ? `${name}을(를) 가져오지 못했습니다`
          : "파일을 가져오지 못했습니다",
        description:
          error instanceof Error ? error.message : "알 수 없는 오류입니다.",
      });
      return null;
    } finally {
      busy = false;
    }
  };

  return {
    async importModel() {
      const asset = await pick(MODEL_FILE_TYPE, "model", (name) =>
        name.toLowerCase().endsWith(".glb") ? MODEL_MIME_TYPE : null,
      );
      const preset = asset && findPreset(modelPresetId(asset.id));
      if (preset) startPresetPlacement(placement, preset);
    },
    importImage: () => pick(IMAGE_FILE_TYPES, "image", imageMimeType),
  };
}
