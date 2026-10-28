import { expect, test } from "@playwright/test";

import {
  clickViewport,
  expectScene,
  openEditor,
  placementHint,
  placePreset,
  pressHangul,
  selectMesh,
} from "./editor";

test.beforeEach(async ({ page }) => openEditor(page));

const activeTool = (page: import("@playwright/test").Page) =>
  page.locator("[data-pressed]").first();

test("한글 입력 상태에서도 도구 단축키가 동작한다", async ({ page }) => {
  const cases = [
    ["ㅂ", "KeyQ", "선택"],
    ["ㄷ", "KeyE", "회전"],
    ["ㄱ", "KeyR", "크기"],
    ["ㅈ", "KeyW", "이동"],
  ] as const;
  for (const [key, code, tool] of cases) {
    await pressHangul(page, key, code);
    await expect(activeTool(page)).toHaveAttribute("aria-label", tool);
  }
});

test("한글 입력 상태에서 ⌘C/⌘V/⌘Z", async ({ page }) => {
  await placePreset(page, "1", -100, 60);
  await selectMesh(page, "Box 1");
  await pressHangul(page, "ㅊ", "KeyC", { metaKey: true });
  await pressHangul(page, "ㅍ", "KeyV", { metaKey: true });
  await expect(placementHint(page)).toContainText("붙여넣기");
  await clickViewport(page, 150, 60);
  await expectScene(page, ["Box 1", "Box 2"]);

  await pressHangul(page, "ㅋ", "KeyZ", { metaKey: true });
  await expectScene(page, ["Box 1"]);
});
