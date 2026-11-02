import { expect, type Page, test } from "@playwright/test";

import {
  axisInput,
  clickViewport,
  expectScene,
  mockFileSystem,
  openEditor,
  placePreset,
  readMockFile,
  sceneList,
  selectMesh,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
});

function selectedNames(page: Page) {
  return sceneList(page).locator("button[aria-pressed='true']");
}

function rowButton(page: Page, name: string) {
  return sceneList(page).getByRole("button", { name, exact: true });
}

async function objectMenu(page: Page, ...items: string[]) {
  await page.getByRole("menuitem", { name: "객체", exact: true }).click();
  for (const [index, item] of items.entries()) {
    const menuItem = page.getByRole("menuitem", { name: item });
    // 하위 메뉴는 올려서 연다
    if (index < items.length - 1) await menuItem.hover();
    else await menuItem.click();
  }
}

test("숨긴 메쉬는 선택에서 빠지고 클릭해도 고를 수 없다, ⌥H로 모두 보인다", async ({
  page,
}) => {
  await placePreset(page, "1");
  await placePreset(page, "2", 200, 0);
  await selectMesh(page, "Box 1");

  await rowButton(page, "Box 1 숨기기").click();
  await expect(rowButton(page, "Box 1 보이기")).toBeVisible();
  await expect(selectedNames(page)).toHaveCount(0);
  // 목록에서도, 뷰포트의 그 자리에서도 고를 수 없다
  await selectMesh(page, "Box 1");
  await clickViewport(page);
  await expect(selectedNames(page)).toHaveCount(0);

  // H: 선택한 메쉬 숨기기
  await selectMesh(page, "Sphere 1");
  await page.keyboard.press("h");
  await expect(rowButton(page, "Sphere 1 보이기")).toBeVisible();
  expect(await undoMenuText(page)).toContain("Sphere 1 숨기기");

  await page.keyboard.press("Alt+h");
  await expect(rowButton(page, "Box 1 숨기기")).toBeAttached();
  await expect(rowButton(page, "Sphere 1 숨기기")).toBeAttached();
  expect(await undoMenuText(page)).toContain("메쉬 2개 보이기");

  // undo 한 번에 둘 다 다시 숨는다
  await page.keyboard.press("Meta+z");
  await expect(rowButton(page, "Box 1 보이기")).toBeVisible();
  await expect(rowButton(page, "Sphere 1 보이기")).toBeVisible();
});

test("잠근 메쉬는 뷰포트·⌘A로 고를 수 없고 목록으로만 고른다, 파일에 저장된다", async ({
  page,
}) => {
  await placePreset(page, "1");
  await placePreset(page, "2", 200, 0);
  await rowButton(page, "Box 1 잠그기").click();
  await expect(rowButton(page, "Box 1 잠금 풀기")).toBeVisible();

  await clickViewport(page);
  await expect(selectedNames(page)).toHaveCount(0);
  await page.keyboard.press("Meta+a");
  await expect(selectedNames(page)).toHaveText(["Sphere 1"]);
  await selectMesh(page, "Box 1");
  await expect(selectedNames(page)).toHaveText(["Box 1"]);

  // 객체 메뉴로 풀기 → undo
  await objectMenu(page, "잠금 풀기");
  await expect(rowButton(page, "Box 1 잠그기")).toBeAttached();
  await page.keyboard.press("Meta+z");
  await expect(rowButton(page, "Box 1 잠금 풀기")).toBeVisible();

  await page.keyboard.press("Meta+s");
  await expect.poll(() => readMockFile(page, "scene.json")).toBeTruthy();
  const saved = JSON.parse(await readMockFile(page, "scene.json"));
  expect(saved.meshes.map((mesh: { locked: boolean }) => mesh.locked)).toEqual([
    true,
    false,
  ]);
});

test("End는 띄운 메쉬를 바닥에 붙인다 (undo 가능)", async ({ page }) => {
  await placePreset(page, "1");
  await selectMesh(page, "Box 1");
  const y = axisInput(page, "Y", "position");
  const floorY = await y.inputValue();
  await y.fill("3");
  await y.press("Enter");
  await expect(y).toHaveValue("3");

  await page.keyboard.press("End");
  await expect(y).toHaveValue(floorY);
  expect(await undoMenuText(page)).toContain("Box 1 바닥에 붙이기");
  await page.keyboard.press("Meta+z");
  await expect(y).toHaveValue("3");
});

test("정렬은 2개, 분배는 3개 이상에서 켜지고 Command 하나로 기록된다", async ({
  page,
}) => {
  await placePreset(page, "1", -200, 0);
  await placePreset(page, "1", 0, 80);
  await placePreset(page, "1", 150, -40);
  await expectScene(page, ["Box 1", "Box 2", "Box 3"]);

  await selectMesh(page, "Box 1");
  await page.getByRole("menuitem", { name: "객체", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "정렬" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Meta+a");
  await objectMenu(page, "정렬", "Z 최소");
  // 이미 최소에 있던 메쉬는 움직이지 않아 기록에서 빠진다
  expect(await undoMenuText(page)).toContain("메쉬 2개 정렬");

  // 정렬된 Z는 모두 같다
  const zValues: string[] = [];
  for (const name of ["Box 1", "Box 2", "Box 3"]) {
    await selectMesh(page, name);
    zValues.push(await axisInput(page, "Z", "position").inputValue());
  }
  expect(new Set(zValues).size).toBe(1);

  await page.keyboard.press("Meta+a");
  await objectMenu(page, "같은 간격으로 분배", "X축");
  await expect
    .poll(() => undoMenuText(page))
    .toMatch(/메쉬 \d개 분배|Box \d 분배/);
});
