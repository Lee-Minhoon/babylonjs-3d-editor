import { expect, type Page, test } from "@playwright/test";

import {
  openEditor,
  placePreset,
  sceneList,
  undoMenuText,
  viewportPoint,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

function selectedNames(page: Page) {
  return sceneList(page).locator("button[aria-pressed='true']");
}

/** 캔버스 중심 기준 (x1, y1) → (x2, y2) 왼쪽 드래그 */
async function dragViewport(
  page: Page,
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
) {
  const from = await viewportPoint(page, x1, y1);
  const to = await viewportPoint(page, x2, y2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test("선택 도구의 왼쪽 드래그·모든 도구의 Shift+드래그는 박스 선택, 변형 도구의 드래그는 카메라", async ({
  page,
}) => {
  await placePreset(page, "1", -150, 0);
  await placePreset(page, "2", 150, 0);
  await page.keyboard.press("q");

  await dragViewport(page, [-320, -160], [320, 160]);
  await expect(selectedNames(page)).toHaveText(["Box 1", "Sphere 1"]);

  // 이동 도구의 맨 드래그는 카메라 회전 — 선택은 그대로
  await page.keyboard.press("w");
  await dragViewport(page, [-300, 200], [-200, 200]);
  await expect(selectedNames(page)).toHaveText(["Box 1", "Sphere 1"]);

  // 선택 해제 후, 이동 도구에서 Shift+드래그로 다시 고른다 (기존 선택에 더함)
  await page.keyboard.press("Escape");
  await page.keyboard.press("q");
  await dragViewport(page, [-320, -160], [320, 160]);
  await expect(selectedNames(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("w");
  await page.keyboard.down("Shift");
  await dragViewport(page, [-320, -160], [320, 160]);
  await page.keyboard.up("Shift");
  await expect(selectedNames(page)).toHaveCount(2);
  // 선택은 히스토리에 남지 않는다
  expect(await undoMenuText(page)).toContain("Sphere 1 추가");
});

test("숫자패드 5는 직교 투영, 7·보기 메뉴는 시점을 바꾼다 (히스토리에 남지 않음)", async ({
  page,
}) => {
  await placePreset(page, "1");
  const canvas = page.locator("canvas");
  const viewMenu = page.getByRole("menuitem", { name: "보기", exact: true });
  const ortho = page.getByRole("menuitemcheckbox", { name: /직교 투영/ });

  // 화면이 멈춘 뒤 숫자패드를 누르면 바뀐다.
  // (메뉴를 연 뒤에는 포커스가 메뉴바에 남는데, Playwright의 Numpad7은 key가 "Home"이라 메뉴바가 가져간다
  // — Num Lock을 끈 키보드와 같다. 그래서 메뉴보다 먼저 누른다)
  await page.waitForTimeout(400);
  let before = await canvas.screenshot();
  await page.keyboard.press("Numpad5");
  await page.keyboard.press("Numpad7");
  await expect(async () => {
    expect((await canvas.screenshot()).equals(before)).toBe(false);
  }).toPass({ timeout: 3_000 });
  await viewMenu.click();
  await expect(ortho).toBeChecked();
  await page.keyboard.press("Escape");

  await page.waitForTimeout(400);
  before = await canvas.screenshot();
  await viewMenu.click();
  await page.getByRole("menuitem", { name: "시점" }).hover();
  await page.getByRole("menuitem", { name: /^정면/ }).click();
  await expect(async () => {
    expect((await canvas.screenshot()).equals(before)).toBe(false);
  }).toPass({ timeout: 3_000 });

  await viewMenu.click();
  await ortho.click();
  await viewMenu.click();
  await expect(ortho).not.toBeChecked();
  await page.keyboard.press("Escape");
  expect(await undoMenuText(page)).toContain("Box 1 추가");
});
