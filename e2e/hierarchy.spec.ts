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
  await placePreset(page, "1", -120, 60);
  await placePreset(page, "2", 120, 60);
  await expectScene(page, ["Box 1", "Sphere 1"]);
});

const row = (page: Page, name: string) =>
  sceneList(page).filter({ hasText: name });

/** 씬 목록 줄의 들여쓰기 (px) */
const indent = (page: Page, name: string) =>
  row(page, name).evaluate((li) =>
    parseFloat(getComputedStyle(li).paddingLeft),
  );

test("씬 목록에서 끌어 놓으면 자식이 되고, 빈 곳에 놓으면 최상위로 (undo 가능)", async ({
  page,
}) => {
  await row(page, "Sphere 1").dragTo(row(page, "Box 1"));
  await expect(page.getByRole("button", { name: "Box 1 접기" })).toBeVisible();
  expect(await indent(page, "Sphere 1")).toBeGreaterThan(
    await indent(page, "Box 1"),
  );
  expect(await undoMenuText(page)).toContain("Sphere 1 부모 지정");

  // 접으면 자식이 목록에서 빠지고, 펴면 돌아온다
  await page.getByRole("button", { name: "Box 1 접기" }).click();
  await expectScene(page, ["Box 1"]);
  await page.getByRole("button", { name: "Box 1 펼치기" }).click();
  await expectScene(page, ["Box 1", "Sphere 1"]);

  // 자기 자식 위에는 놓을 수 없다
  await row(page, "Box 1").dragTo(row(page, "Sphere 1"));
  expect(await undoMenuText(page)).toContain("Sphere 1 부모 지정");

  await row(page, "Sphere 1").dragTo(
    page.getByText("끌어서 다른 항목 위에 놓으면 자식이 됩니다"),
  );
  await expect(page.getByRole("button", { name: "Box 1 접기" })).toHaveCount(0);
  expect(await undoMenuText(page)).toContain("Sphere 1 부모 해제");

  await page.keyboard.press("Meta+z");
  await expect(page.getByRole("button", { name: "Box 1 접기" })).toBeVisible();
});

test("P: 마지막에 고른 것이 부모, ⌥P: 해제. 패널 값은 부모 기준", async ({
  page,
}) => {
  await selectMesh(page, "Sphere 1");
  // 둘 다 바닥 위(y=0.5)라 부모 기준 높이는 0
  await expect(axisInput(page, "Y", "position")).toHaveValue("0.5");
  await row(page, "Box 1")
    .getByRole("button", { name: "Box 1", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.keyboard.press("p");
  await expect(page.getByRole("button", { name: "Box 1 접기" })).toBeVisible();
  expect(await undoMenuText(page)).toContain("Sphere 1 부모 지정");

  await selectMesh(page, "Sphere 1");
  await expect(page.getByText("부모 Box 1 기준")).toBeVisible();
  await expect(axisInput(page, "Y", "position")).toHaveValue("0");

  await page.keyboard.press("Alt+p");
  await expect(page.getByText("부모 Box 1 기준")).toHaveCount(0);
  await expect(axisInput(page, "Y", "position")).toHaveValue("0.5");
});

test("부모를 지우면 자식도 함께, 복제하면 자식까지, 저장 파일에 parent 번호", async ({
  page,
}) => {
  await row(page, "Sphere 1").dragTo(row(page, "Box 1"));

  await selectMesh(page, "Box 1");
  await page.keyboard.press("Delete");
  await expectScene(page, []);
  await page.keyboard.press("Meta+z");
  await expectScene(page, ["Box 1", "Sphere 1"]);

  await selectMesh(page, "Box 1");
  await page.keyboard.press("Meta+d");
  await clickViewport(page, 0, -60);
  await expectScene(page, ["Box 1", "Sphere 1", "Box 2", "Sphere 2"]);
  await expect(page.getByRole("button", { name: "Box 2 접기" })).toBeVisible();

  await page.keyboard.press("Meta+s");
  const saved = JSON.parse(await readMockFile(page, "scene.json"));
  expect(saved.meshes.map((m: { parent: number | null }) => m.parent)).toEqual([
    null,
    0,
    null,
    2,
  ]);
});

test("뷰포트에서 접힌 부모의 자식을 고르면 목록이 펼쳐진다", async ({
  page,
}) => {
  await row(page, "Sphere 1").dragTo(row(page, "Box 1"));
  await page.getByRole("button", { name: "Box 1 접기" }).click();
  await expectScene(page, ["Box 1"]);
  // 오른쪽 메쉬(Sphere 1)를 뷰포트에서 클릭
  await page.keyboard.press("q");
  await clickViewport(page, 120, 60);
  await expectScene(page, ["Box 1", "Sphere 1"]);
  await expect(
    row(page, "Sphere 1").getByRole("button", {
      name: "Sphere 1",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});
