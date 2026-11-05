import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { openFile, saveFile } from "@/lib/file-access";

import {
  type AssetStore,
  createAssetStore,
  MODEL_MIME_TYPE,
  modelPresetId,
} from "./asset-store";
import { createHistory } from "./history";
import { createSpawnMeshCommand } from "./mesh-commands";
import { addPresetMesh, findPreset, isModelObject } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import { createSceneFile, type SceneFileNotice } from "./scene-file";
import { clearEditorMeshes, getEditorMeshes } from "./scene-format";
import { packScene, readSceneBytes } from "./scene-package";
import type { Selection } from "./selection";
import { createTestScene, fakeModelLoader } from "./test-scene";

// 브라우저 파일 창 대신 메모리로
vi.mock("@/lib/file-access", () => ({
  openFile: vi.fn(),
  saveFile: vi.fn(),
}));

const scene = createTestScene();

function setup({ historyLimit }: { historyLimit?: number } = {}) {
  const history = createHistory({ limit: historyLimit });
  const notify = vi.fn<(notice: SceneFileNotice) => void>();
  const assets = createAssetStore(scene, { loadModel: fakeModelLoader });
  const sceneFile = createSceneFile(scene, {
    history,
    selection: { select: () => {} } as unknown as Selection,
    placement: { cancel: () => {} } as unknown as PlacementTool,
    assets,
    notify,
  });
  const addBox = () =>
    history.execute(
      createSpawnMeshCommand(
        scene,
        () => addPresetMesh(scene, findPreset("box")!),
        "추가",
        "Box",
      ),
    );
  const addModel = async () => {
    const asset = await assets.add({
      name: "chair.glb",
      type: "model",
      mimeType: MODEL_MIME_TYPE,
      bytes: new Uint8Array([4, 2]),
    });
    const preset = findPreset(modelPresetId(asset.id))!;
    history.execute(
      createSpawnMeshCommand(
        scene,
        () => addPresetMesh(scene, preset),
        "추가",
        preset.label,
      ),
    );
  };
  return { history, sceneFile, notify, addBox, addModel, assets };
}

/** saveFile에 넘긴 마지막 내용을 바이트로 */
async function savedBytes(): Promise<Uint8Array> {
  const content = vi.mocked(saveFile).mock.lastCall![0];
  return content instanceof Blob
    ? new Uint8Array(await content.arrayBuffer())
    : new TextEncoder().encode(content);
}

const meshCount = (text: string) =>
  (JSON.parse(text) as { meshes: unknown[] }).meshes.length;

beforeEach(() => {
  vi.mocked(saveFile).mockResolvedValue({
    name: "scene.json",
    handle: null,
  });
});
afterEach(() => {
  vi.resetAllMocks();
  clearEditorMeshes(scene);
});

describe("저장", () => {
  test("저장하면 깨끗해지고, undo로 저장 시점을 벗어나면 다시 변경 있음", async () => {
    const { history, sceneFile, addBox } = setup();
    addBox();
    expect(sceneFile.getState().dirty).toBe(true);

    await sceneFile.save();
    expect(sceneFile.getState()).toMatchObject({
      fileName: "scene.json",
      dirty: false,
    });
    history.undo();
    expect(sceneFile.getState().dirty).toBe(true);
    history.redo();
    expect(sceneFile.getState().dirty).toBe(false);
  });

  test("히스토리 최대 개수를 넘긴 뒤 끝까지 undo 해도 되돌릴 수 없는 편집이 남아 변경 있음", () => {
    const { history, sceneFile, addBox } = setup({ historyLimit: 2 });
    addBox();
    addBox();
    addBox(); // 첫 번째 추가는 히스토리에서 빠져 되돌릴 수 없다
    history.undo();
    history.undo();
    expect(getEditorMeshes(scene)).toHaveLength(1);
    expect(sceneFile.getState().dirty).toBe(true);
  });

  test("쓰는 동안 한 편집은 파일에 없으므로 변경 있음으로 남는다", async () => {
    const { history, sceneFile, addBox } = setup();
    addBox();
    let finishWrite!: () => void;
    vi.mocked(saveFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ name: "scene.json", handle: null });
        }),
    );

    const saving = sceneFile.save();
    addBox(); // 핸들 저장은 모달이 없어서 쓰는 중에도 편집할 수 있다
    finishWrite();
    await saving;

    expect(meshCount(vi.mocked(saveFile).mock.calls[0][0] as string)).toBe(1);
    expect(sceneFile.getState().dirty).toBe(true);
    history.undo(); // 파일에 쓴 시점으로 돌아오면 깨끗하다
    expect(sceneFile.getState().dirty).toBe(false);
  });

  test("저장 창을 취소하면 아무것도 바뀌지 않는다", async () => {
    const { sceneFile, addBox } = setup();
    addBox();
    vi.mocked(saveFile).mockResolvedValue(null);
    await sceneFile.save();
    expect(sceneFile.getState()).toMatchObject({ fileName: null, dirty: true });
  });
});

describe("열기 · 새 씬", () => {
  test("잘못된 파일은 알리고 씬을 그대로 둔다", async () => {
    const { sceneFile, notify, addBox } = setup();
    addBox();
    await sceneFile.save();
    vi.mocked(openFile).mockResolvedValue({
      name: "bad.json",
      bytes: new TextEncoder().encode("{broken"),
      handle: null,
    });

    await sceneFile.open();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: expect.stringContaining("bad.json"),
      }),
    );
    expect(getEditorMeshes(scene)).toHaveLength(1);
    expect(sceneFile.getState().fileName).toBe("scene.json");
  });

  test("변경이 있으면 묻고, 버리지 않으면 그대로 둔다", async () => {
    const { sceneFile, addBox } = setup();
    addBox();

    const creating = sceneFile.newScene();
    expect(sceneFile.getState().confirmPending).toBe(true);
    sceneFile.resolveConfirm(false);
    await creating;
    expect(getEditorMeshes(scene)).toHaveLength(1);

    const creatingAgain = sceneFile.newScene();
    sceneFile.resolveConfirm(true);
    await creatingAgain;
    expect(getEditorMeshes(scene)).toHaveLength(0);
    expect(sceneFile.getState().dirty).toBe(false);
  });
});

describe("에셋이 있는 씬 (.zip 묶음)", () => {
  let assets: AssetStore | null = null;
  afterEach(() => assets?.dispose());

  test("모델이 있으면 .zip으로 저장하고, 그 파일을 열면 모델이 돌아온다", async () => {
    const setupResult = setup();
    assets = setupResult.assets;
    const { sceneFile, addModel, addBox } = setupResult;
    addBox();
    await addModel();
    vi.mocked(saveFile).mockResolvedValue({ name: "scene.zip", handle: null });

    await sceneFile.save();
    const [, options] = vi.mocked(saveFile).mock.lastCall!;
    expect(options).toMatchObject({
      suggestedName: "scene.zip",
      type: { extension: ".zip" },
    });
    const bytes = await savedBytes();
    expect(readSceneBytes(bytes).files.size).toBe(2); // scene.json + 모델

    await sceneFile.newScene();
    expect(getEditorMeshes(scene)).toHaveLength(0);
    vi.mocked(openFile).mockResolvedValue({
      name: "scene.zip",
      bytes,
      handle: null,
    });
    await sceneFile.open();
    const opened = getEditorMeshes(scene);
    expect(opened.map((mesh) => mesh.name)).toEqual(["Box 1", "chair 1"]);
    expect(isModelObject(opened[1])).toBe(true);
    expect(sceneFile.getState()).toMatchObject({
      fileName: "scene.zip",
      dirty: false,
    });
  });

  test(".json으로 저장한 씬에 모델이 생기면 같은 파일에 덮어쓰지 않고 .zip 위치를 묻는다", async () => {
    const setupResult = setup();
    assets = setupResult.assets;
    const { sceneFile, addModel, addBox } = setupResult;
    const handle = { name: "level.json" } as FileSystemFileHandle;
    vi.mocked(saveFile).mockResolvedValue({ name: "level.json", handle });
    addBox();
    await sceneFile.save();
    addBox();
    await sceneFile.save(); // 에셋이 없으면 같은 파일에 덮어쓴다
    expect(vi.mocked(saveFile).mock.lastCall![1].handle).toBe(handle);

    await addModel();
    await sceneFile.save();
    expect(vi.mocked(saveFile).mock.lastCall![1]).toMatchObject({
      handle: null,
      suggestedName: "level.zip",
    });
  });

  test("묶음에 모델 파일이 빠져 있으면 알리고 씬은 그대로", async () => {
    const setupResult = setup();
    assets = setupResult.assets;
    const { sceneFile, addModel, notify } = setupResult;
    await addModel();
    await sceneFile.save();
    const bytes = await savedBytes();
    // 모델을 모르는 새 탭에서, 모델 파일이 빠진 묶음을 연다
    const { text } = readSceneBytes(bytes);
    const tampered = packScene(text, []);
    vi.mocked(openFile).mockResolvedValue({
      name: "broken.zip",
      bytes: tampered,
      handle: null,
    });
    assets.dispose();
    assets = createAssetStore(scene, { loadModel: fakeModelLoader });
    const fresh = createSceneFile(scene, {
      history: createHistory(),
      selection: { select: () => {} } as unknown as Selection,
      placement: { cancel: () => {} } as unknown as PlacementTool,
      assets,
      notify,
    });
    await fresh.open();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        description: expect.stringContaining("파일에 없습니다"),
      }),
    );
    expect(getEditorMeshes(scene)).toHaveLength(1);
    fresh.dispose();
  });
});
