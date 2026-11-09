import { expect, test } from "@playwright/test";

import {
  closeMenu,
  expectScene,
  mockFileSystem,
  openEditor,
  placePreset,
  sceneList,
  selectMesh,
  undoMenuText,
  writeMockFile,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("⌘A는 씬의 메쉬를 전부 선택한다", async ({ page }) => {
  await placePreset(page, "1", -120, 60);
  await placePreset(page, "2", 120, 60);
  await page.keyboard.press("Meta+a");
  await expect(
    sceneList(page).locator("button[aria-pressed='true']"),
  ).toHaveText(["Box 1", "Sphere 1"]);
  // 전체 선택 → 삭제 → undo 한 번에 둘 다 돌아온다
  await page.keyboard.press("Delete");
  await expectScene(page, []);
  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1", "Sphere 1"]);
});

test("F는 선택한 메쉬로 화면을 옮기고, 히스토리에 남지 않는다", async ({
  page,
}) => {
  await placePreset(page, "1", -250, 120);
  const viewMenu = page.getByRole("menuitem", { name: "보기", exact: true });
  const focusItem = page.getByRole("menuitem", {
    name: /선택 항목에 맞춰 보기/,
  });

  await viewMenu.click();
  await expect(focusItem).toBeDisabled();
  await closeMenu(page);

  await selectMesh(page, "Box 1");
  const canvas = page.locator("canvas");
  // 선택 외곽선·기즈모가 그려질 때까지 기다린 뒤 찍는다
  await page.waitForTimeout(500);
  const before = await canvas.screenshot();
  // F 전에는 화면이 그대로다 (아래 비교가 F 때문에 달라졌다는 근거)
  await page.waitForTimeout(500);
  expect((await canvas.screenshot()).equals(before)).toBe(true);
  await page.keyboard.press("f");
  // 애니메이션(0.25초)이 끝난 뒤 화면이 달라져 있어야 한다
  await expect(async () => {
    expect((await canvas.screenshot()).equals(before)).toBe(false);
  }).toPass({ timeout: 3_000 });
  expect(await undoMenuText(page)).toContain("Box 1 추가");

  await viewMenu.click();
  await expect(focusItem).toBeEnabled();
});

test("스냅 단위는 도구에 따라 이동·회전·크기 단위를 따로 고른다", async ({
  page,
}) => {
  const unit = (kind: string) =>
    page.getByRole("button", { name: `${kind} 스냅 단위` });

  await expect(unit("이동")).toHaveText("0.5");
  await page.keyboard.press("e");
  await expect(unit("회전")).toHaveText("15°");
  await unit("회전").click();
  await page.getByRole("menuitemradio", { name: "45°" }).click();
  await expect(unit("회전")).toHaveText("45°");

  await page.keyboard.press("r");
  await expect(unit("크기")).toHaveText("×0.1");
  // 다른 도구로 갔다 와도 각자 값을 기억한다
  await page.keyboard.press("w");
  await expect(unit("이동")).toHaveText("0.5");
  await page.keyboard.press("e");
  await expect(unit("회전")).toHaveText("45°");
});

test("기즈모 축: 툴바 버튼과 보기 메뉴가 같은 상태를 바꾼다", async ({
  page,
}) => {
  const toggle = page.getByRole("button", { name: /^기즈모 축/ });
  await expect(toggle).toHaveAccessibleName("기즈모 축: 로컬 축");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("기즈모 축: 월드 축");

  await page.getByRole("menuitem", { name: "보기", exact: true }).click();
  const local = page.getByRole("menuitemradio", { name: "로컬 축" });
  await expect(
    page.getByRole("menuitemradio", { name: "월드 축" }),
  ).toBeChecked();
  await local.click();
  await expect(toggle).toHaveAccessibleName("기즈모 축: 로컬 축");
});

test("성능 표시: 보기 메뉴로 켜면 FPS·객체 수가 보이고, 끄면 사라진다", async ({
  page,
}) => {
  await placePreset(page, "1", -120, 60);
  await placePreset(page, "2", 120, 60);
  const overlay = page.getByLabel("성능", { exact: true });
  await expect(overlay).toHaveCount(0);

  await page.getByRole("menuitem", { name: "보기", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "성능 표시" }).click();
  await expect(overlay).toContainText(/FPS\s*\d+ \(/);
  await expect(overlay).toContainText(/객체\s*2/);

  await page.getByRole("menuitem", { name: "보기", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "성능 표시" }).click();
  await expect(overlay).toHaveCount(0);
});

test("메쉬가 많아도 씬 목록은 보이는 줄만 그리고, 스크롤하면 아래 줄이 나온다", async ({
  page,
}) => {
  const meshes = Array.from({ length: 300 }, (_, i) => ({
    presetId: "box",
    name: `Box ${i + 1}`,
    position: [(i % 20) * 1.5, 0.5, Math.floor(i / 20) * 1.5],
    rotation: [0, 0, 0],
    scaling: [1, 1, 1],
    material: null,
  }));
  await mockFileSystem(page);
  await page.reload();
  await openEditor(page);
  await writeMockFile(
    page,
    "many.json",
    JSON.stringify({ format: "babylonjs-3d-editor/scene", version: 8, meshes }),
  );
  await page.keyboard.press("Meta+o");
  await expect(page.getByText("씬 (300)")).toBeVisible();
  const rendered = await sceneList(page).count();
  expect(rendered).toBeLessThan(100);
  await expect(sceneList(page).first()).toHaveAttribute("aria-setsize", "300");

  // ⌘A는 그려지지 않은 줄까지 모두 고른다
  await page.keyboard.press("Meta+a");
  await expect(page.getByText("메쉬 300개 선택됨")).toBeVisible();
  await expect(page.getByText("외 250개")).toBeVisible();

  await page
    .getByRole("list", { name: "씬 메쉬" })
    .evaluate((list) =>
      list.closest("[data-slot=scroll-area-viewport]")!.scrollTo(0, 1e6),
    );
  await expect(sceneList(page).last()).toHaveText("Box 300");
  await expect(sceneList(page).last()).toHaveAttribute("aria-posinset", "300");
});
