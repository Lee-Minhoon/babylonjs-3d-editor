import { expect, test } from "@playwright/test";

import {
  fileMenu,
  inspectPng,
  mockFileSystem,
  openEditor,
  placePreset,
  readMockFile,
  selectMesh,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
});

test("머티리얼: 발광색·불투명도·조명 무시도 각각 Command 하나", async ({
  page,
}) => {
  await placePreset(page, "2");
  await selectMesh(page, "Sphere 1");

  const emissive = page.getByLabel("발광색 hex");
  await expect(emissive).toHaveValue("#000000");
  await emissive.fill("ff8800");
  await emissive.press("Enter");
  await expect(emissive).toHaveValue("#FF8800");
  expect(await undoMenuText(page)).toContain("Sphere 1 머티리얼");

  const alpha = page.getByRole("slider", { name: "불투명도" });
  await alpha.focus();
  await page.keyboard.press("Home");
  await expect(alpha).toHaveAttribute("aria-valuenow", "0");

  // 조명 무시를 켜면 메탈릭·거칠기는 쓰이지 않아 잠긴다
  const unlit = page.getByRole("switch", { name: "조명 무시" });
  await unlit.click();
  await expect(unlit).toBeChecked();
  await expect(page.getByRole("slider", { name: "메탈릭" })).toBeDisabled();

  // 스위치에 포커스가 있을 때 ⌘Z는 한 번만 되돌린다 (조명 무시만, 불투명도는 그대로)
  await page.keyboard.press("Meta+z");
  await expect(unlit).not.toBeChecked();
  await expect(alpha).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("slider", { name: "메탈릭" })).toBeEnabled();
});

test("선택이 없으면 씬 설정: 배경색·톤 매핑이 undo되고 파일·스크린샷에 반영된다", async ({
  page,
}) => {
  const background = page.getByLabel("배경색 hex");
  await expect(background).toHaveValue("#1A1A1F");
  await background.fill("#3366cc");
  await background.press("Enter");
  await expect(background).toHaveValue("#3366CC");
  expect(await undoMenuText(page)).toContain("씬 설정");

  await page.getByLabel("톤 매핑").selectOption({ label: "ACES" });
  await page.keyboard.press("Meta+z");
  await expect(page.getByLabel("톤 매핑")).toHaveValue("none");
  await page.keyboard.press("Meta+Shift+z");
  await expect(page.getByLabel("톤 매핑")).toHaveValue("aces");

  await page.keyboard.press("Meta+s");
  await expect(page.getByText("scene.json 저장됨")).toBeVisible();
  const saved = JSON.parse(await readMockFile(page, "scene.json"));
  expect(saved.settings).toMatchObject({
    background: "#3366CC",
    toneMapping: "aces",
  });

  // 배경색은 실제 화면에 칠해진다
  await fileMenu(page, /스크린샷 저장/);
  await expect(page.getByText("scene.png 저장됨")).toBeVisible();
  const { background: pixel } = await inspectPng(page, "scene.png");
  expect(pixel).toEqual([0x33, 0x66, 0xcc]);

  // 새 씬은 기본 설정으로
  await fileMenu(page, "새 씬");
  await expect(background).toHaveValue("#1A1A1F");
  await expect(page.getByLabel("톤 매핑")).toHaveValue("none");
});
