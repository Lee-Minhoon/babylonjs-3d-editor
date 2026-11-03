import { expect, test } from "@playwright/test";

import {
  clickViewport,
  expectScene,
  openEditor,
  placementHint,
  pressHangul,
  viewportPoint,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

/** 사이드바에서 켜져 있는(배치 중인) 프리셋 버튼 */
function activePreset(page: import("@playwright/test").Page) {
  return page.locator("aside").first().getByRole("button", { pressed: true });
}

function addMenu(page: import("@playwright/test").Page) {
  return page.getByRole("dialog", { name: "추가" });
}

test("⇧A: 커서 자리에 검색창, 거르고 Enter로 배치 시작", async ({ page }) => {
  const point = await viewportPoint(page, 40, 30);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.press("Shift+A");
  await expect(addMenu(page)).toBeVisible();
  const box = await addMenu(page).boundingBox();
  expect(Math.abs(box!.x - point.x)).toBeLessThan(2);
  expect(Math.abs(box!.y - point.y)).toBeLessThan(2);

  const search = page.getByRole("combobox", { name: "추가할 것 검색" });
  await expect(search).toBeFocused();
  await search.fill("원기");
  await expect(addMenu(page).getByRole("option")).toHaveText([/Cylinder/]);
  await page.keyboard.press("Enter");
  await expect(addMenu(page)).toHaveCount(0);
  await expect(activePreset(page)).toHaveText(/Cylinder/);

  await clickViewport(page, 0, 60);
  await expectScene(page, ["Cylinder 1"]);
});

test("↑↓로 고르고, 클릭으로도 고른다. Esc는 닫기만", async ({ page }) => {
  await page.keyboard.press("Shift+A");
  await page.keyboard.press("ArrowDown");
  await expect(
    addMenu(page).getByRole("option", { selected: true }),
  ).toContainText("Sphere");
  await page.keyboard.press("Escape");
  await expect(addMenu(page)).toHaveCount(0);
  await expect(placementHint(page)).toContainText("고른 뒤 씬에서");

  await page.getByRole("menuitem", { name: "추가", exact: true }).click();
  await page.getByRole("menuitem", { name: /검색해서 추가/ }).click();
  await expect(addMenu(page)).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "추가할 것 검색" }),
  ).toBeFocused();
  await addMenu(page).getByRole("option", { name: /Torus/ }).click();
  await expect(activePreset(page)).toHaveText(/Torus/);
});

test("한글 입력 상태에서도 ⇧A가 열리고, 바깥을 누르면 닫힌다", async ({
  page,
}) => {
  await pressHangul(page, "ㅁ", "KeyA", { shiftKey: true });
  await expect(addMenu(page)).toBeVisible();
  await clickViewport(page, 0, 150);
  await expect(addMenu(page)).toHaveCount(0);
  await expectScene(page, []);
});
