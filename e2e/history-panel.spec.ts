import { expect, type Page, test } from "@playwright/test";

import { expectScene, openEditor, placePreset, undoMenuText } from "./editor";

function historyPanel(page: Page) {
  return page.getByRole("region", { name: "히스토리" });
}

function historyItems(page: Page) {
  return historyPanel(page).getByRole("listitem");
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await placePreset(page, "1", -150, 60);
  await placePreset(page, "2", 0, 60);
  await placePreset(page, "5", 150, 60);
  await page.keyboard.press("Escape");
});

test("기록을 오래된 것부터 보여주고, 누르면 그 시점으로 한 번에 간다", async ({
  page,
}) => {
  await expect(historyItems(page)).toHaveText([
    "시작",
    "Box 1 추가",
    "Sphere 1 추가",
    "Cone 1 추가",
  ]);
  const current = historyPanel(page).locator("[aria-current=step]");
  await expect(current).toHaveText("Cone 1 추가");

  await historyPanel(page).getByRole("button", { name: "Box 1 추가" }).click();
  await expectScene(page, ["Box 1"]);
  await expect(current).toHaveText("Box 1 추가");
  // 되돌린 항목도 목록에 남는다 (redo 가능)
  await expect(historyItems(page)).toHaveCount(4);
  expect(await undoMenuText(page)).toContain("Box 1 추가");

  await historyPanel(page).getByRole("button", { name: "Cone 1 추가" }).click();
  await expectScene(page, ["Box 1", "Sphere 1", "Cone 1"]);

  await historyPanel(page).getByRole("button", { name: "시작" }).click();
  await expectScene(page, []);
  await expect(page.getByLabel("실행 취소")).toBeDisabled();
});

test("되돌린 뒤 새로 편집하면 그 뒤의 기록은 사라진다", async ({ page }) => {
  await historyPanel(page).getByRole("button", { name: "Box 1 추가" }).click();
  await placePreset(page, "8", 0, 120);
  await page.keyboard.press("Escape");
  await expect(historyItems(page)).toHaveText([
    "시작",
    "Box 1 추가",
    "Plane 1 추가",
  ]);
});

test("접으면 목록이 사라지고 다시 펼칠 수 있다", async ({ page }) => {
  const toggle = historyPanel(page).getByRole("button", { name: /기록/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(historyItems(page)).toHaveCount(0);
  await toggle.click();
  await expect(historyItems(page)).toHaveCount(4);
});
