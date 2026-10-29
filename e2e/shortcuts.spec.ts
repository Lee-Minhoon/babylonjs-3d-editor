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

test("열린 메뉴 안에서 누른 키는 에디터 단축키로 새지 않는다", async ({
  page,
}) => {
  await page.getByRole("menuitem", { name: "편집", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("1"); // 메뉴 안에서는 항목 찾기(typeahead)용
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(placementHint(page)).toContainText("메쉬를 고른 뒤");
});

test("슬라이더를 조절하는 중의 Delete는 메쉬를 지우지 않는다", async ({
  page,
}) => {
  await placePreset(page, "1", -100, 60);
  await selectMesh(page, "Box 1");
  // aria-label은 슬라이더 그룹에 붙고, 포커스는 그 안의 thumb(range input)이 받는다
  await page.getByRole("group", { name: "메탈릭" }).getByRole("slider").focus();
  await page.keyboard.press("Delete");
  await expectScene(page, ["Box 1"]);
});

test("숫자 키를 누르고 있어도(키 반복) 배치 모드가 깜빡이지 않는다", async ({
  page,
}) => {
  // 같은 키를 떼지 않고 다시 누르면 Playwright는 repeat=true로 보낸다
  // (반복이 한 번이면 켜짐 → 꺼짐이 되어 버그가 드러난다)
  await page.keyboard.down("1");
  await page.keyboard.down("1");
  await page.keyboard.up("1");
  await expect(placementHint(page)).toContainText("클릭할 때마다 배치");
});
