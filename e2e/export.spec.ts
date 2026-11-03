import { expect, type Page, test } from "@playwright/test";

import {
  mockFileSystem,
  openEditor,
  placePreset,
  readMockBlob,
  sceneList,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
});

async function fileMenu(page: Page, item: string | RegExp) {
  await page.getByRole("menuitem", { name: "파일", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("glTF(.glb)로 내보내기는 GLB 파일을 저장하고 씬·히스토리는 그대로 둔다", async ({
  page,
}) => {
  await placePreset(page, "1", -120, 0);
  await placePreset(page, "2", 120, 0);
  await sceneList(page)
    .getByRole("button", { name: "Sphere 1 숨기기" })
    .click();

  await fileMenu(page, /glTF\(\.glb\)로 내보내기/);
  await expect(page.getByText("scene.glb 저장됨")).toBeVisible();
  const glb = await readMockBlob(page, "scene.glb");
  expect(glb?.magic).toBe("glTF");
  expect(glb?.size).toBeGreaterThan(1000);

  expect(await undoMenuText(page)).toContain("Sphere 1 숨기기");
  // 내보내기는 씬 파일 저장이 아니다 — 저장 안 된 변경 표시가 남는다
  await expect(page.getByLabel("저장되지 않은 변경 사항")).toBeVisible();
});

/** 저장된 PNG를 읽어 크기·배경색·위/아래 절반의 "배경이 아닌" 픽셀 수를 센다 */
function inspectPng(page: Page, name: string) {
  return page.evaluate(async (fileName) => {
    const blob = (window as unknown as { __blobs: Record<string, Blob> })
      .__blobs[fileName];
    const image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const background = [...data.slice(0, 3)];
    const half = (image.height / 2) * image.width;
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < image.width * image.height; i++) {
      const differs = [0, 1, 2].some(
        (c) => Math.abs(data[i * 4 + c] - background[c]) > 24,
      );
      if (differs) {
        if (i < half) top++;
        else bottom++;
      }
    }
    const viewport = document.querySelector("canvas")!;
    return {
      size: [image.width, image.height],
      canvas: [viewport.width, viewport.height],
      background,
      top,
      bottom,
    };
  }, name);
}

// WebGL 폴백에서도 같은 결과인지 (navigator.gpu를 없애면 엔진이 WebGL로 뜬다)
for (const engine of ["WebGPU", "WebGL"] as const) {
  test(`스크린샷은 메쉬만 담은 캔버스 크기 PNG이고, 씬 파일 이름을 따른다 (${engine})`, async ({
    page,
  }) => {
    if (engine === "WebGL") {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "gpu", { value: undefined }),
      );
      await page.reload();
      await openEditor(page);
    }
    await expect(page.locator("header")).toContainText(engine);
    // 화면 아래쪽에 하나만 놓는다 → 위아래가 뒤집히면 위쪽 절반에 찍힌다
    await placePreset(page, "1", 0, 180);
    await page.keyboard.press("Meta+s");
    await expect(page.getByText("scene.json 저장됨")).toBeVisible();

    await fileMenu(page, /스크린샷 저장/);
    await expect(page.getByText("scene.png 저장됨")).toBeVisible();
    const png = await readMockBlob(page, "scene.png");
    expect(png?.magic).toBe("\x89PNG");

    const result = await inspectPng(page, "scene.png");
    expect(result.size).toEqual(result.canvas);
    // 배경은 씬 배경색(어두운 회색) — 하얗거나 투명하지 않다
    expect(Math.max(...result.background)).toBeLessThan(60);
    // 메쉬는 아래쪽에만 (격자가 찍혔다면 위쪽에도 배경과 다른 픽셀이 많다)
    expect(result.bottom).toBeGreaterThan(1000);
    expect(result.top).toBeLessThan(result.bottom / 20);
  });
}
