import { expect, test } from "@playwright/test";

import {
  axisInput,
  clickViewport,
  expectScene,
  openEditor,
  placementHint,
  placePreset,
  selectMesh,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => openEditor(page));

test("프리셋 배치는 Esc까지 계속 놓이고, undo/redo된다", async ({ page }) => {
  await page.keyboard.press("1");
  await expect(placementHint(page)).toContainText("클릭할 때마다 배치");
  await clickViewport(page, -150, 60);
  await clickViewport(page, 150, 60);
  await page.keyboard.press("Escape");
  await expectScene(page, ["Box 1", "Box 2"]);
  expect(await undoMenuText(page)).toContain("Box 2 추가");

  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1"]);
  await page.keyboard.press("Meta+Shift+z");
  await expectScene(page, ["Box 1", "Box 2"]);
});

test("배치 중 R로 90° 돌려서 놓는다", async ({ page }) => {
  await page.keyboard.press("8");
  await page.keyboard.press("r");
  await expect(placementHint(page)).toContainText("90°");
  await clickViewport(page);
  await page.keyboard.press("Escape");

  await selectMesh(page, "Plane 1");
  await expect(axisInput(page, "Y", "rotation")).toHaveValue("90");
});

test("붙여넣기는 미리보기 후 클릭 한 번에 놓이고, 원본 변형을 유지한다", async ({
  page,
}) => {
  await placePreset(page, "1", -100, 80);
  await selectMesh(page, "Box 1");
  const scaleY = axisInput(page, "Y", "scaling");
  await scaleY.fill("2");
  await scaleY.press("Enter");

  await page.keyboard.press("Meta+c");
  await page.keyboard.press("Meta+v");
  await expect(placementHint(page)).toContainText("붙여넣기");
  await clickViewport(page, 150, 80);

  await expectScene(page, ["Box 1", "Box 2"]);
  await expect(placementHint(page)).not.toContainText("붙여넣기");
  // 붙여넣은 메쉬가 선택된다
  await expect(axisInput(page, "Y", "scaling")).toHaveValue("2");
  // 높이 2배 박스의 밑면이 바닥에 닿는다
  await expect(axisInput(page, "Y", "position")).toHaveValue("1");
});

test("우클릭은 배치를 취소한다", async ({ page }) => {
  await page.keyboard.press("2");
  const { x, y } = await page
    .locator("canvas")
    .boundingBox()
    .then((b) => ({
      x: b!.x + b!.width / 2,
      y: b!.y + b!.height / 2,
    }));
  await page.mouse.click(x, y, { button: "right" });
  await expect(placementHint(page)).toContainText("메쉬를 고른 뒤");
  await expectScene(page, []);
});
