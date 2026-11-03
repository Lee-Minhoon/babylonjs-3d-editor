import { expect, test } from "@playwright/test";

import {
  axisInput,
  openEditor,
  placePreset,
  selectMesh,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await placePreset(page, "2");
  await selectMesh(page, "Sphere 1");
});

test("숫자 입력은 Enter로 커밋되고 undo 한 번에 되돌아간다", async ({
  page,
}) => {
  const x = axisInput(page, "X", "position");
  const before = await x.inputValue();
  await x.fill("3");
  await x.press("Enter");
  expect(await undoMenuText(page)).toContain("Sphere 1 이동");

  await page.keyboard.press("Meta+z");
  await expect(x).toHaveValue(before);
});

test("입력창 Esc는 편집을 취소하고 기록하지 않는다", async ({ page }) => {
  const x = axisInput(page, "X", "position");
  const before = await x.inputValue();
  // 타이핑 직후 바로 Esc → blur가 취소한 값을 커밋하던 버그가 있었다 (가끔만 재현돼서 여러 번 반복)
  for (let i = 0; i < 10; i++) {
    await x.fill(String(10 + i));
    await x.press("Escape");
  }
  await expect(x).toHaveValue(before);
  expect(await undoMenuText(page)).toContain("Sphere 1 추가");
});

test("입력창 ⌘Z는 편집을 취소하고, 그 뒤 포커스가 떠나도 취소한 값이 다시 적용되지 않는다", async ({
  page,
}) => {
  const x = axisInput(page, "X", "position");
  const before = await x.inputValue();
  await x.fill("5");
  await expect(x).toHaveValue("5");
  await x.press("Meta+z");
  await page.keyboard.press("Tab");
  await expect(x).toHaveValue(before);
  expect(await undoMenuText(page)).toContain("Sphere 1 추가");
});

test("머티리얼: hex·슬라이더 편집이 각각 Command 하나", async ({ page }) => {
  const hex = page.getByLabel("기본색 hex");
  await hex.fill("d4af37");
  await hex.press("Enter");
  await expect(hex).toHaveValue("#D4AF37");
  expect(await undoMenuText(page)).toContain("Sphere 1 머티리얼");

  const metallic = page.getByRole("slider", { name: "메탈릭" });
  await metallic.focus();
  await page.keyboard.press("End");
  await expect(metallic).toHaveAttribute("aria-valuenow", "1");

  // 슬라이더에 포커스가 있어도 ⌘Z가 동작한다
  await page.keyboard.press("Meta+z");
  await expect(metallic).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("Meta+z");
  await expect(hex).not.toHaveValue("#D4AF37");
});

test("모양: 분할 슬라이더는 놓을 때 Command 하나, 다른 프리셋과 함께 고르면 숨는다", async ({
  page,
}) => {
  await placePreset(page, "1", 120, 0);
  await page.keyboard.press("Escape");
  await selectMesh(page, "Sphere 1");
  const segments = page.getByRole("slider", { name: "분할" });
  await expect(segments).toHaveAttribute("aria-valuenow", "32");
  await segments.focus();
  await page.keyboard.press("Home");
  await expect(segments).toHaveAttribute("aria-valuenow", "3");
  expect(await undoMenuText(page)).toContain("Sphere 1 모양");
  await segments.focus();
  await page.keyboard.press("Meta+z");
  await expect(segments).toHaveAttribute("aria-valuenow", "32");

  await page
    .getByRole("list", { name: "씬 메쉬" })
    .getByRole("button", { name: "Box 1", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("메쉬 2개 선택됨")).toBeVisible();
  await expect(page.getByRole("slider", { name: "분할" })).toHaveCount(0);
});
