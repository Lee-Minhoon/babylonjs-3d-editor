import { expect, type Page, test } from "@playwright/test";

import {
  expectScene,
  openEditor,
  placePreset,
  sceneList,
  undoMenuText,
  viewportPoint,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await placePreset(page, "1", -120, 60);
  await placePreset(page, "2", 120, 60);
  await expectScene(page, ["Box 1", "Sphere 1"]);
});

const openMenu = (page: Page, name: string) =>
  page.locator("[role=menu][data-open]").and(page.getByLabel(name));

/** 뷰포트를 우클릭 (움직이지 않은 탭) */
async function rightClickViewport(page: Page, dx: number, dy: number) {
  const { x, y } = await viewportPoint(page, dx, dy);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: "right" });
}

const isSelected = (page: Page, name: string) =>
  sceneList(page)
    .filter({ hasText: new RegExp(`^${name}$`) })
    .getByRole("button", { name, exact: true });

test("객체를 우클릭하면 그것만 골라 선택 메뉴, 삭제는 undo 가능", async ({
  page,
}) => {
  await rightClickViewport(page, -120, 60);
  const menu = openMenu(page, "선택 메뉴");
  await expect(menu).toBeFocused();
  await expect(isSelected(page, "Box 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await menu.getByRole("menuitem", { name: /^삭제/ }).click();
  await expectScene(page, ["Sphere 1"]);
  await expect(menu).toHaveCount(0);
  expect(await undoMenuText(page)).toContain("Box 1 삭제");
});

test("빈 곳을 우클릭하면 씬 메뉴 — 추가…는 그 자리에 검색창", async ({
  page,
}) => {
  await rightClickViewport(page, 0, -150);
  const menu = openMenu(page, "씬 메뉴");
  await expect(menu).toBeFocused();
  await expect(
    menu.getByRole("menuitem", { name: /^붙여넣기/ }),
  ).toHaveAttribute("data-disabled");
  await menu.getByRole("menuitem", { name: /^추가/ }).click();
  await expect(
    page.getByRole("combobox", { name: "추가할 것 검색" }),
  ).toBeFocused();
});

test("씬 목록 줄을 우클릭: 그 줄을 골라 이름 바꾸기, Esc로 닫으면 선택은 그대로", async ({
  page,
}) => {
  const row = sceneList(page).filter({ hasText: "Sphere 1" });
  await row.click({ button: "right" });
  const menu = openMenu(page, "선택 메뉴");
  await expect(menu).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(isSelected(page, "Sphere 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await row.click({ button: "right" });
  await expect(menu).toBeFocused();
  await menu.getByRole("menuitem", { name: /^이름 바꾸기/ }).click();
  const nameInput = page.getByRole("textbox", { name: "메쉬 이름" });
  await expect(nameInput).toBeFocused();
  await nameInput.fill("공");
  await nameInput.press("Enter");
  await expectScene(page, ["Box 1", "공"]);
});

test("오른쪽 드래그(카메라 이동)는 메뉴를 열지 않는다", async ({ page }) => {
  const { x, y } = await viewportPoint(page, -120, 60);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 80, y + 40, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(300);
  await expect(page.locator("[role=menu][data-open]")).toHaveCount(0);
});
