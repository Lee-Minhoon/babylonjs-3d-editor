import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

import { type FileTypeOptions, saveFile } from "@/lib/file-access";

import { getMeshFlag } from "./mesh-flags";
import type { SceneFileNotice } from "./scene-file";
import { getEditorMeshes } from "./scene-format";

/*
 * 내보내기 (파일 메뉴): glTF 바이너리(.glb)와 뷰포트 스크린샷(.png). 씬은 바꾸지 않는다 (히스토리·저장 상태와 무관).
 * 둘 다 "보이는 에디터 메쉬"만 담는다 — 바닥 격자·배치 미리보기·기즈모·선택 외곽선·숨긴 메쉬는 빠진다.
 * 직렬화기(@babylonjs/serializers)는 처음 내보낼 때 불러온다 (에디터 첫 로딩에 넣지 않는다).
 */

export const GLB_FILE_TYPE: FileTypeOptions = {
  description: "glTF 바이너리",
  mimeType: "model/gltf-binary",
  extension: ".glb",
};

export const PNG_FILE_TYPE: FileTypeOptions = {
  description: "PNG 이미지",
  mimeType: "image/png",
  extension: ".png",
};

/** 내보낼 메쉬: 숨기지 않은 에디터 메쉬 (만든 순서) */
export function getExportMeshes(scene: Scene): AbstractMesh[] {
  return getEditorMeshes(scene).filter((mesh) => !getMeshFlag(mesh, "hidden"));
}

/** 씬을 GLB로. 메쉬 이름·변형·PBR 머티리얼이 들어간다 (카메라·조명·환경은 빼고) */
export async function exportGlb(scene: Scene, baseName: string): Promise<Blob> {
  const meshes = new Set<Node>(getExportMeshes(scene));
  const { GLTF2Export } = await import("@babylonjs/serializers/glTF/2.0");
  const data = await GLTF2Export.GLBAsync(scene, baseName, {
    shouldExportNode: (node) => meshes.has(node),
    // 왼손 → 오른손 좌표 변환용 빈 루트 노드를 남기지 않는다
    removeNoopRootNodes: true,
  });
  const file = data.files[`${baseName}.glb`];
  if (!(file instanceof Blob)) throw new Error("GLB를 만들지 못했습니다.");
  return file;
}

/**
 * RGBA 픽셀을 PNG로. 렌더 타깃은 WebGL·WebGPU 모두 아래 줄부터 읽혀서 위아래를 뒤집는다 (두 엔진에서 확인).
 * Babylon의 스크린샷 도구(CreateScreenshotUsingRenderTargetAsync)는 PNG 인코딩을 별도 WebGL 엔진의 셰이더 패스로 하는데,
 * 딥 import에선 셰이더·확장이 빠져 하얀 이미지가 나오거나 끝나지 않는다 — 그래서 2D 캔버스로 직접 인코딩한다.
 */
async function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 만들 수 없습니다.");
  const image = context.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * row;
    image.data.set(pixels.subarray(from, from + row), y * row);
  }
  // 배경까지 불투명하게 (렌더 타깃 알파가 0이면 PNG 뷰어에서 투명하게 보인다)
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG를 만들지 못했습니다.")),
      PNG_FILE_TYPE.mimeType,
    ),
  );
}

/** 지금 카메라 시점의 PNG (캔버스 렌더 크기 그대로, 보이는 에디터 메쉬만) */
export async function captureScreenshot(scene: Scene): Promise<Blob> {
  const camera = scene.activeCamera;
  if (!camera) throw new Error("카메라가 없습니다.");
  const engine = scene.getEngine();
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  const { RenderTargetTexture } =
    await import("@babylonjs/core/Materials/Textures/renderTargetTexture");

  // 격자·미리보기는 renderList에서 빠지고, 기즈모(유틸리티 레이어)·선택 외곽선(효과 레이어)은 렌더 타깃에 그려지지 않는다
  const target = new RenderTargetTexture(
    "__screenshot",
    { width, height },
    scene,
    { generateMipMaps: false, samples: 4 },
  );
  try {
    target.renderList = getExportMeshes(scene);
    target.activeCamera = camera;
    target.clearColor = scene.clearColor;
    target.render();
    const pixels = await target.readPixels();
    if (!pixels) throw new Error("화면을 읽지 못했습니다.");
    return await encodePng(
      new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
      width,
      height,
    );
  } finally {
    target.dispose();
  }
}

/** "scene.json" → "scene" (저장 전이면 "scene") */
export function exportBaseName(sceneFileName: string | null): string {
  return (sceneFileName ?? "scene").replace(/\.json$/i, "") || "scene";
}

export type SceneExport = {
  exportGlb(): Promise<void>;
  saveScreenshot(): Promise<void>;
};

export function createSceneExport(
  scene: Scene,
  {
    getFileName,
    notify,
  }: {
    getFileName: () => string | null;
    notify: (notice: SceneFileNotice) => void;
  },
): SceneExport {
  let busy = false;

  /** 만들기 → 저장 위치 고르기 → 쓰기. 취소면 조용히, 실패면 알림 */
  const run = async (
    create: (baseName: string) => Promise<Blob>,
    type: FileTypeOptions,
    failTitle: string,
  ) => {
    if (busy) return;
    busy = true;
    try {
      const baseName = exportBaseName(getFileName());
      const blob = await create(baseName);
      const saved = await saveFile(blob, {
        handle: null,
        suggestedName: `${baseName}${type.extension}`,
        type,
      });
      if (saved) notify({ type: "success", title: `${saved.name} 저장됨` });
    } catch (error) {
      notify({
        type: "error",
        title: failTitle,
        description:
          error instanceof Error ? error.message : "알 수 없는 오류입니다.",
      });
    } finally {
      busy = false;
    }
  };

  return {
    exportGlb: () =>
      run(
        (baseName) => exportGlb(scene, baseName),
        GLB_FILE_TYPE,
        "glTF로 내보내지 못했습니다",
      ),
    saveScreenshot: () =>
      run(
        () => captureScreenshot(scene),
        PNG_FILE_TYPE,
        "스크린샷을 저장하지 못했습니다",
      ),
  };
}
