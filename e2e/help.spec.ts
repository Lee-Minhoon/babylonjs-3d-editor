import { expect, type Page, test } from "@playwright/test";

import { expectScene, openEditor, placementHint } from "./editor";

/** 도움말 창의 한 단축키 묶음 (예: "도구") */
function shortcutGroup(page: Page, title: string) {
  return page
    .getByRole("dialog")
    .getByRole("region", { name: `${title} 단축키` });
}

/** 묶음 안에서 동작 이름 → 첫 번째 키 */
async function keyFor(page: Page, group: string, action: string) {
  const row = shortcutGroup(page, group)
    .locator("dt", { hasText: action })
    .locator("..");
  return (await row.locator("kbd kbd, dd kbd").first().textContent()) ?? "";
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("?와 도움말 메뉴로 단축키 창을 열고, Esc로 닫는다", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "단축키" });
  await page.keyboard.press("Shift+Slash");
  await expect(dialog).toBeVisible();
  await expect(shortcutGroup(page, "선택")).toContainText(
    "선택 해제 · 배치 끝내기Esc",
  );
  await expect(
    dialog.getByRole("table", { name: "마우스 조작" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("menuitem", { name: "도움말", exact: true }).click();
  await page.getByRole("menuitem", { name: /^단축키/ }).click();
  await expect(dialog).toBeVisible();
  // 창 안의 키는 에디터로 새지 않는다 (1 = Box 배치가 켜지면 안 됨)
  await page.keyboard.press("1");
  await page.keyboard.press("Escape");
  await expect(placementHint(page)).toContainText("메쉬를 고른 뒤");
});

test("도움말 창에 적힌 도구·메쉬 단축키가 실제로 동작한다", async ({
  page,
}) => {
  await page.keyboard.press("Shift+Slash");
  const tools: [string, string][] = [];
  for (const tool of ["선택", "이동", "회전", "크기"]) {
    tools.push([tool, await keyFor(page, "도구", tool)]);
  }
  const sphereKey = await keyFor(page, "메쉬 추가", "Sphere");
  await page.keyboard.press("Escape");

  const viewMenu = page.getByRole("menuitem", { name: "보기", exact: true });
  // 창을 닫자마자 누른 키도 받는다 (닫히는 중인 창이 키를 막던 버그)
  for (const [tool, key] of tools) {
    await page.keyboard.press(key.toLowerCase());
    await viewMenu.click();
    await expect(
      page.getByRole("menuitemradio", { name: new RegExp(`^${tool}`) }),
    ).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  }

  await page.keyboard.press(sphereKey);
  await expect(placementHint(page)).toContainText("씬을 클릭할 때마다");
  const canvas = page.locator("canvas");
  await canvas.click();
  await page.keyboard.press("Escape");
  await expectScene(page, ["Sphere 1"]);
});

test("사용 설명서는 새 탭으로 열리고, 메쉬 종류와 단축키를 보여준다", async ({
  page,
}) => {
  await page.getByRole("menuitem", { name: "도움말", exact: true }).click();
  const [manual] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("menuitem", { name: /사용 설명서/ }).click(),
  ]);
  await expect(manual).toHaveURL(/\/manual$/);
  await expect(
    manual.getByRole("heading", { name: "사용 설명서", level: 1 }),
  ).toBeVisible();

  const add = manual.getByRole("region", { name: "메쉬 추가", exact: true });
  for (const name of ["Box", "Sphere", "Torus", "Plane"]) {
    await expect(add.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(
    manual.getByRole("region", { name: "보기 단축키" }),
  ).toContainText("원근 ↔ 직교Num5");
  await manual.getByRole("link", { name: "단축키 전체" }).click();
  await expect(manual).toHaveURL(/#shortcuts$/);
  await manual.getByRole("link", { name: "에디터로" }).click();
  await expect(manual).toHaveURL(/\/$/);
});
