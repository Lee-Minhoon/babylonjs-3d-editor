import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import {
  clickViewport,
  expectScene,
  fileMenu,
  mockFileSystem,
  openEditor,
  placePreset,
  readMockBytes,
  readMockFile,
  sceneList,
  selectMesh,
  setNextOpen,
  undoMenuText,
  writeMockBytes,
} from "./editor";
import { createTestGlb } from "./test-glb";

test.beforeEach(async ({ page }) => {
  await mockFileSystem(page);
  await openEditor(page);
});

test("GLB 모델을 가져와 놓고, .zip으로 저장한 뒤 다시 열면 모델이 돌아온다", async ({
  page,
}) => {
  await writeMockBytes(page, "box-pair.glb", createTestGlb());
  await fileMenu(page, "모델 가져오기(.glb)…");
  // 가져오면 바로 그 모델의 배치 모드 (클릭할 때마다 놓는다)
  await clickViewport(page, -100, 60);
  await clickViewport(page, 100, 60);
  await page.keyboard.press("Escape");
  await expectScene(page, ["box-pair 1", "box-pair 2"]);

  await page.keyboard.press("Meta+s");
  await expect(page.getByText("scene.zip 저장됨")).toBeVisible();
  const zip = unzipSync((await readMockBytes(page, "scene.zip"))!);
  const scene = JSON.parse(strFromU8(zip["scene.json"]));
  const [asset] = scene.assets;
  expect(asset).toMatchObject({ name: "box-pair.glb", type: "model" });
  expect(
    scene.meshes.map((mesh: { presetId: string }) => mesh.presetId),
  ).toEqual([`model:${asset.id}`, `model:${asset.id}`]);
  expect(zip[`assets/${asset.id}.glb`]).toBeDefined();

  await fileMenu(page, "새 씬");
  await expectScene(page, []);
  await setNextOpen(page, "scene.zip");
  await page.keyboard.press("Meta+o");
  await expectScene(page, ["box-pair 1", "box-pair 2"]);
});

test("가져온 모델은 ⇧A 검색에 남는다", async ({ page }) => {
  await writeMockBytes(page, "box-pair.glb", createTestGlb());
  await fileMenu(page, "모델 가져오기(.glb)…");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Shift+A");
  const search = page.getByRole("combobox", { name: "추가할 것 검색" });
  await search.fill("box-pair");
  await expect(
    page.getByRole("listbox", { name: "추가할 것" }).getByRole("option"),
  ).toHaveText([/box-pair.*모델/]);
  await search.press("Enter");
  await clickViewport(page, 0, 60);
  await page.keyboard.press("Escape");
  await expectScene(page, ["box-pair 1"]);
});

test("GLB가 아닌 파일은 알리고 아무것도 바꾸지 않는다", async ({ page }) => {
  await writeMockBytes(page, "broken.glb", new TextEncoder().encode("hello"));
  await fileMenu(page, "모델 가져오기(.glb)…");
  await expect(
    page.getByText("broken.glb을(를) 가져오지 못했습니다"),
  ).toBeVisible();
  await clickViewport(page, 0, 60);
  await expectScene(page, []);
});

/** 1×1 PNG */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

test("머티리얼 텍스처: 이미지를 가져와 기본색 맵에 넣고, undo·저장된다", async ({
  page,
}) => {
  await placePreset(page, "1", 0, 60);
  await selectMesh(page, "Box 1");
  const colorMap = page.getByRole("combobox", { name: "기본색 맵" });
  await expect(colorMap).toHaveValue("");
  await expect(page.getByRole("slider", { name: "텍스처 반복" })).toHaveCount(
    0,
  );

  await writeMockBytes(page, "wood.png", PNG);
  await colorMap.selectOption({ label: "이미지 가져오기…" });
  await expect(colorMap.locator("option:checked")).toHaveText("wood.png");
  // 이미지가 그대로 보이게 기본색은 흰색으로
  await expect(page.getByRole("textbox", { name: "기본색 hex" })).toHaveValue(
    "#FFFFFF",
  );
  await expect(page.getByRole("slider", { name: "텍스처 반복" })).toBeVisible();
  expect(await undoMenuText(page)).toContain("Box 1 머티리얼");

  // 가져온 이미지는 다른 칸 목록에도 있다
  const normalMap = page.getByRole("combobox", { name: "노멀 맵" });
  await normalMap.selectOption({ label: "wood.png" });
  await expect(normalMap.locator("option:checked")).toHaveText("wood.png");
  await page.keyboard.press("Meta+z");
  await expect(normalMap).toHaveValue("");

  await page.keyboard.press("Meta+s");
  await expect(page.getByText("scene.zip 저장됨")).toBeVisible();
  const zip = unzipSync((await readMockBytes(page, "scene.zip"))!);
  const scene = JSON.parse(strFromU8(zip["scene.json"]));
  const [image] = scene.assets;
  expect(image).toMatchObject({ name: "wood.png", type: "image" });
  expect(scene.meshes[0].material).toMatchObject({
    colorMap: image.id,
    normalMap: null,
  });
  expect(zip[`assets/${image.id}.png`]).toBeDefined();
});

test("공유 머티리얼: 여러 메쉬가 같이 쓰고, 하나를 고치면 모두 바뀐다", async ({
  page,
}) => {
  await placePreset(page, "1", -100, 60);
  await placePreset(page, "2", 100, 60);
  await selectMesh(page, "Box 1");
  await sceneList(page)
    .filter({ hasText: "Sphere 1" })
    .getByRole("button", { name: "Sphere 1", exact: true })
    .click({ modifiers: ["Shift"] });

  const shared = page.getByRole("combobox", { name: "공유 머티리얼" });
  await shared.selectOption({ label: "새 공유 머티리얼로 만들기" });
  await expect(shared.locator("option:checked")).toHaveText("머티리얼 1");
  expect(await undoMenuText(page)).toContain("머티리얼 1 만들기");

  // 이름 칸 안의 ⌘Z는 한 번만 undo 된다 (칸과 머티리얼 섹션이 둘 다 처리하면 두 단계가 되돌아간다)
  const name = page.getByRole("textbox", { name: "공유 머티리얼 이름" });
  await name.focus();
  await page.keyboard.press("Meta+z");
  expect(await undoMenuText(page)).toContain("Sphere 1 추가");
  await page.keyboard.press("Meta+Shift+z");
  await expect(shared.locator("option:checked")).toHaveText("머티리얼 1");

  await name.fill("빨간 플라스틱");
  await name.press("Enter");
  await expect(shared.locator("option:checked")).toHaveText("빨간 플라스틱");

  // Box만 골라 색을 바꾸면 Sphere도 바뀐다
  await selectMesh(page, "Box 1");
  const hex = page.getByRole("textbox", { name: "기본색 hex" });
  await hex.fill("#FF0000");
  await hex.press("Enter");
  await selectMesh(page, "Sphere 1");
  await expect(hex).toHaveValue("#FF0000");

  // 연결을 끊으면 따로
  await shared.selectOption({ label: "공유 안 함 (이 메쉬 전용)" });
  await hex.fill("#00FF00");
  await hex.press("Enter");
  await selectMesh(page, "Box 1");
  await expect(hex).toHaveValue("#FF0000");
  await expect(shared.locator("option:checked")).toHaveText("빨간 플라스틱");

  await page.keyboard.press("Meta+s");
  await expect(page.getByText("scene.json 저장됨")).toBeVisible();
  const scene = JSON.parse((await readMockFile(page, "scene.json"))!);
  expect(scene.materials).toEqual([
    expect.objectContaining({ name: "빨간 플라스틱" }),
  ]);
  expect(
    scene.meshes.map(
      (mesh: { materialRef: string | null }) => mesh.materialRef,
    ),
  ).toEqual([scene.materials[0].id, null]);
});
