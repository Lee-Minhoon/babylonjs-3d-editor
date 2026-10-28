import { expect, type Page, test } from "@playwright/test";

import { expectScene, mockFileSystem, openEditor, placePreset } from "./editor";

/** 자동 저장 대기(1초) 뒤 새로고침. 변경이 있으면 뜨는 "나가시겠습니까?"는 수락한다 */
async function reloadAfterAutosave(page: Page) {
  await page.waitForTimeout(1_500);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.reload();
  // 복구 대화상자가 뜨면 나머지 화면은 접근성 트리에서 빠지므로 role 대신 CSS로 기다린다
  await expect(
    page.locator("aside button", { hasText: "Box" }).first(),
  ).toBeEnabled({ timeout: 20_000 });
}

const recoveryDialog = (page: Page) =>
  page.getByRole("alertdialog", { name: "저장하지 않은 작업이 있습니다" });

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
});

test("새로고침 후 복구하면 씬이 돌아오고, 저장 안 된 상태로 표시된다", async ({
  page,
}) => {
  await placePreset(page, "1", -120, 60);
  await placePreset(page, "2", 120, 60);
  await reloadAfterAutosave(page);

  await expect(recoveryDialog(page)).toBeVisible();
  await page.getByRole("button", { name: "복구" }).click();
  await expectScene(page, ["Box 1", "Sphere 1"]);
  await expect(
    page.locator("header").getByLabel("저장되지 않은 변경 사항"),
  ).toBeVisible();
  // 복구 직후 undo할 것은 없다 (히스토리는 새로 시작)
  await expect(page.getByLabel("실행 취소")).toBeDisabled();
});

test("버리면 빈 씬으로 시작하고, 다음에는 묻지 않는다", async ({ page }) => {
  await placePreset(page, "1");
  await reloadAfterAutosave(page);

  await page.getByRole("button", { name: "버리기" }).click();
  await expectScene(page, []);
  await reloadAfterAutosave(page);
  await expect(recoveryDialog(page)).toHaveCount(0);
});

test("파일로 저장했으면 묻지 않는다", async ({ page }) => {
  await placePreset(page, "1");
  await page.keyboard.press("Meta+s");
  await expect(page.locator("header")).toContainText("scene.json");
  await reloadAfterAutosave(page);
  await expect(recoveryDialog(page)).toHaveCount(0);
});
