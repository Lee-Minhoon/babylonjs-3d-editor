import { expect, test } from "@playwright/test";

import {
  expectScene,
  mockFileSystem,
  openEditor,
  placePreset,
  readMockFile,
  sceneList,
  selectMesh,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
  await placePreset(page, "1", -100, 60);
  await placePreset(page, "2", 100, 60);
});

const nameField = (page: import("@playwright/test").Page) =>
  page.locator("#mesh-name-input");

test("씬 목록 더블클릭으로 이름을 바꾸고 undo 한 번에 되돌린다", async ({
  page,
}) => {
  await sceneList(page)
    .getByRole("button", { name: "Box 1", exact: true })
    .dblclick();
  const input = sceneList(page).getByLabel("메쉬 이름");
  await input.fill("문");
  await input.press("Enter");
  await expectScene(page, ["문", "Sphere 1"]);
  expect(await undoMenuText(page)).toContain("Box 1 이름 변경");

  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1", "Sphere 1"]);
});

test("속성 패널 이름 칸: F2로 이동, Esc는 취소, 빈 이름은 무시", async ({
  page,
}) => {
  await selectMesh(page, "Sphere 1");
  await page.keyboard.press("F2");
  await expect(nameField(page)).toBeFocused();

  await page.keyboard.type("공");
  await page.keyboard.press("Escape");
  await expect(nameField(page)).toHaveValue("Sphere 1");

  await nameField(page).fill("  ");
  await nameField(page).press("Enter");
  await expectScene(page, ["Box 1", "Sphere 1"]);

  await nameField(page).fill("공");
  await nameField(page).press("Enter");
  await expectScene(page, ["Box 1", "공"]);
});

test("바꾼 이름은 파일에 저장되고, 번호 이름이면 다음 번호가 이어진다", async ({
  page,
}) => {
  await selectMesh(page, "Box 1");
  await nameField(page).fill("Box 9");
  await nameField(page).press("Enter");
  await placePreset(page, "1", 0, 160);
  await expectScene(page, ["Box 9", "Sphere 1", "Box 10"]);

  await page.keyboard.press("Meta+s");
  const saved = JSON.parse(await readMockFile(page, "scene.json"));
  expect(saved.meshes.map((m: { name: string }) => m.name)).toEqual([
    "Box 9",
    "Sphere 1",
    "Box 10",
  ]);
});
