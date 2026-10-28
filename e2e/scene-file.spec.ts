import { expect, test } from "@playwright/test";

import {
  axisInput,
  expectScene,
  mockFileSystem,
  openEditor,
  placePreset,
  readMockFile,
  selectMesh,
  writeMockFile,
} from "./editor";

const header = (page: import("@playwright/test").Page) =>
  page.locator("header");

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
});

test("저장 → 새 씬 → 열기로 그대로 복원된다", async ({ page }) => {
  await placePreset(page, "1", -120, 60);
  await placePreset(page, "2", 120, 60);
  await expect(header(page)).toContainText("제목 없음");
  await expect(
    header(page).getByLabel("저장되지 않은 변경 사항"),
  ).toBeVisible();

  await page.keyboard.press("Meta+s");
  await expect(header(page)).toContainText("scene.json");
  await expect(header(page).getByLabel("저장되지 않은 변경 사항")).toHaveCount(
    0,
  );
  const saved = JSON.parse(await readMockFile(page, "scene.json"));
  expect(saved.version).toBe(2);
  expect(saved.meshes.map((m: { name: string }) => m.name)).toEqual([
    "Box 1",
    "Sphere 1",
  ]);

  await page.getByRole("menuitem", { name: "파일", exact: true }).click();
  await page.getByRole("menuitem", { name: "새 씬" }).click();
  await expectScene(page, []);
  await expect(page.getByLabel("실행 취소")).toBeDisabled();

  await writeMockFile(page, "scene.json", JSON.stringify(saved));
  await page.keyboard.press("Meta+o");
  await expectScene(page, ["Box 1", "Sphere 1"]);
  await expect(header(page)).toContainText("scene.json");
});

test("저장 안 된 변경이 있으면 열기 전에 묻고, 취소하면 그대로", async ({
  page,
}) => {
  await placePreset(page, "1");
  await page.keyboard.press("Meta+o");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectScene(page, ["Box 1"]);
});

test("잘못된 파일은 씬을 바꾸지 않고 이유를 알려준다", async ({ page }) => {
  await writeMockFile(
    page,
    "bad.json",
    JSON.stringify({
      format: "babylonjs-3d-editor/scene",
      version: 2,
      meshes: [{ presetId: "teapot" }],
    }),
  );
  await page.keyboard.press("Meta+o");
  await expect(page.getByText('알 수 없는 프리셋 "teapot"')).toBeVisible();
  await expectScene(page, []);
});

test("v1 파일을 열면 색을 유지한 채 변환된다", async ({ page }) => {
  await writeMockFile(
    page,
    "old.json",
    JSON.stringify({
      format: "babylonjs-3d-editor/scene",
      version: 1,
      meshes: [
        {
          presetId: "cone",
          name: "Cone 3",
          position: [2, 0.5, 0],
          rotation: [0, 0, 0],
          scaling: [1, 1, 1],
          color: "#FF0000",
        },
      ],
    }),
  );
  await page.keyboard.press("Meta+o");
  await expectScene(page, ["Cone 3"]);
  await selectMesh(page, "Cone 3");
  await expect(page.getByLabel("기본색 hex")).toHaveValue("#FF0000");
  await expect(axisInput(page, "X", "position")).toHaveValue("2");
});
