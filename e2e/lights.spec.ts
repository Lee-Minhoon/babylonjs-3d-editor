import { expect, type Page, test } from "@playwright/test";

import {
  clickViewport,
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
});

async function placeLight(page: Page, label: string, dx = 0, dy = 0) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await clickViewport(page, dx, dy);
  await page.keyboard.press("Escape");
}

test("조명은 씬 목록에 메쉬와 함께, 속성은 조명 칸만 (크기·머티리얼 없음)", async ({
  page,
}) => {
  await placePreset(page, "1", -100, 60);
  await page.keyboard.press("Escape");
  await placeLight(page, "Point Light", 60, 60);
  await expectScene(page, ["Box 1", "Point Light 1"]);

  await selectMesh(page, "Point Light 1");
  await expect(page.getByText("조명", { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "범위" })).toBeVisible();
  // 각도는 스포트만, 크기·머티리얼은 메쉬만
  await expect(page.getByRole("slider", { name: "각도 (°)" })).toHaveCount(0);
  await expect(page.getByText("크기", { exact: true })).toHaveCount(0);
  await expect(page.getByText("머티리얼", { exact: true })).toHaveCount(0);
  // 놓은 자리보다 위에 뜬다
  const y = Number(
    await page.locator("input[aria-label='Y position']").inputValue(),
  );
  expect(y).toBeGreaterThan(1.5);
});

test("세기를 바꾸면 화면이 달라지고 Command 하나, 삭제·undo도 메쉬처럼", async ({
  page,
}) => {
  await placePreset(page, "1", 0, 60);
  await page.keyboard.press("Escape");
  await placeLight(page, "Point Light", 0, 20);
  await selectMesh(page, "Point Light 1");

  const canvas = page.locator("canvas");
  const intensity = page.getByRole("slider", { name: "세기" });
  await intensity.focus();
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const dark = await canvas.screenshot();
  await page.keyboard.press("End");
  await expect(async () => {
    expect((await canvas.screenshot()).equals(dark)).toBe(false);
  }).toPass({ timeout: 3_000 });
  expect(await undoMenuText(page)).toContain("Point Light 1 조명");

  await selectMesh(page, "Point Light 1");
  await page.keyboard.press("Delete");
  await expectScene(page, ["Box 1"]);
  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1", "Point Light 1"]);
});

test("⇧A로 찾아 놓고, 그림자·기본 조명 세기는 파일에 저장된다", async ({
  page,
}) => {
  await page.keyboard.press("Shift+A");
  await page.getByRole("combobox", { name: "추가할 것 검색" }).fill("태양");
  await page.keyboard.press("Enter");
  await clickViewport(page, 0, 40);
  await page.keyboard.press("Escape");
  await expectScene(page, ["Directional Light 1"]);

  await selectMesh(page, "Directional Light 1");
  await page.getByRole("switch", { name: "그림자" }).click();
  await expect(page.getByRole("switch", { name: "그림자" })).toBeChecked();
  // 방향광은 범위·각도가 없다
  await expect(page.getByRole("slider", { name: "범위" })).toHaveCount(0);

  await page.keyboard.press("h");
  await expect(
    sceneList(page).getByRole("button", { name: "Directional Light 1 보이기" }),
  ).toBeVisible();

  const ambient = page.getByRole("slider", { name: "기본 조명 세기" });
  await ambient.focus();
  await page.keyboard.press("Home");
  await expect(ambient).toHaveAttribute("aria-valuenow", "0");

  // 슬라이더 안의 키는 에디터 단축키가 아니다 — 포커스를 빼고 저장
  await ambient.blur();
  await page.keyboard.press("Meta+s");
  await expect(page.getByText("scene.json 저장됨")).toBeVisible();
  const saved = JSON.parse(await readMockFile(page, "scene.json"));
  expect(saved.version).toBe(7);
  expect(saved.settings.ambientIntensity).toBe(0);
  expect(saved.meshes[0]).toMatchObject({
    presetId: "directional-light",
    hidden: true,
    material: null,
    light: { shadows: true },
  });
});
