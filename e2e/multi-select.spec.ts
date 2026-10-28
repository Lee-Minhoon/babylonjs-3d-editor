import { expect, type Page, test } from "@playwright/test";

import {
  axisInput,
  clickViewport,
  expectScene,
  openEditor,
  placementHint,
  placePreset,
  sceneList,
  selectMesh,
  undoMenuText,
} from "./editor";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await placePreset(page, "1", -150, 60);
  await placePreset(page, "1", 0, 60);
  await placePreset(page, "2", 150, 60);
});

/** 씬 목록에서 Shift+클릭으로 선택에 더한다 */
async function addToSelection(page: Page, name: string) {
  await sceneList(page)
    .filter({ hasText: name })
    .getByRole("button", { name, exact: true })
    .click({ modifiers: ["Shift"] });
}

function selectedNames(page: Page) {
  return sceneList(page).locator("button[aria-pressed='true']");
}

async function setPosition(page: Page, name: string, x: number, z: number) {
  await selectMesh(page, name);
  for (const [axis, value] of [
    ["X", x],
    ["Z", z],
  ] as const) {
    const input = axisInput(page, axis, "position");
    await input.fill(String(value));
    await input.press("Enter");
  }
}

async function readPosition(page: Page, name: string) {
  await selectMesh(page, name);
  return Promise.all(
    (["X", "Y", "Z"] as const).map(async (axis) =>
      Number(await axisInput(page, axis, "position").inputValue()),
    ),
  );
}

test("Shift+클릭으로 여러 개를 고르고, 다시 Shift+클릭하면 뺀다", async ({
  page,
}) => {
  await selectMesh(page, "Box 1");
  await addToSelection(page, "Sphere 1");
  await expect(selectedNames(page)).toHaveText(["Box 1", "Sphere 1"]);
  await expect(page.getByText("메쉬 2개 선택됨")).toBeVisible();

  await addToSelection(page, "Box 1");
  await expect(selectedNames(page)).toHaveText(["Sphere 1"]);

  // 그냥 클릭하면 그것 하나만
  await addToSelection(page, "Box 2");
  await selectMesh(page, "Box 1");
  await expect(selectedNames(page)).toHaveText(["Box 1"]);
});

test("여러 개 삭제는 undo 한 번에 모두 돌아온다", async ({ page }) => {
  await selectMesh(page, "Box 1");
  await addToSelection(page, "Box 2");
  await page.keyboard.press("Delete");
  await expectScene(page, ["Sphere 1"]);
  expect(await undoMenuText(page)).toContain("메쉬 2개 삭제");

  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1", "Box 2", "Sphere 1"]);
});

test("여러 개 붙여넣기: 묶음 미리보기 → 한 번에 놓기 → 놓은 것들이 선택, undo 한 번", async ({
  page,
}) => {
  await selectMesh(page, "Box 1");
  await addToSelection(page, "Sphere 1");
  await page.keyboard.press("Meta+c");
  await page.keyboard.press("Meta+v");
  await expect(placementHint(page)).toContainText("메쉬 2개 붙여넣기");

  await clickViewport(page, 0, 180);
  await expectScene(page, ["Box 1", "Box 2", "Sphere 1", "Box 3", "Sphere 2"]);
  await expect(selectedNames(page)).toHaveText(["Box 3", "Sphere 2"]);
  expect(await undoMenuText(page)).toContain("메쉬 2개 붙여넣기");

  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1", "Box 2", "Sphere 1"]);
});

test("묶음 복제는 서로의 간격을 유지하고, R로 묶음째 돌린다", async ({
  page,
}) => {
  await setPosition(page, "Box 1", 0, 0);
  await setPosition(page, "Box 2", 2, 0);
  await selectMesh(page, "Box 1");
  await addToSelection(page, "Box 2");

  await page.keyboard.press("Meta+d");
  await clickViewport(page, 0, 150);
  const [a, b] = [
    await readPosition(page, "Box 3"),
    await readPosition(page, "Box 4"),
  ];
  expect([b[0] - a[0], b[2] - a[2]]).toEqual([2, 0]);

  await selectMesh(page, "Box 1");
  await addToSelection(page, "Box 2");
  await page.keyboard.press("Meta+d");
  await page.keyboard.press("r");
  await clickViewport(page, -150, 150);
  const [c, d] = [
    await readPosition(page, "Box 5"),
    await readPosition(page, "Box 6"),
  ];
  // +90° (월드 Y): x 방향 간격 2 → z 방향 -2
  expect([d[0] - c[0], d[2] - c[2]]).toEqual([0, -2]);
  await expect(axisInput(page, "Y", "rotation")).toHaveValue("90");
});
