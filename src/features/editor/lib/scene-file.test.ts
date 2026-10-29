import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { openTextFile, saveTextFile } from "@/lib/file-access";

import { createHistory } from "./history";
import { createSpawnMeshCommand } from "./mesh-commands";
import { addPresetMesh, findPreset } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import { createSceneFile, type SceneFileNotice } from "./scene-file";
import { clearEditorMeshes, getEditorMeshes } from "./scene-format";
import type { Selection } from "./selection";
import { createTestScene } from "./test-scene";

// 브라우저 파일 창 대신 메모리로
vi.mock("@/lib/file-access", () => ({
  openTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}));

const scene = createTestScene();

function setup() {
  const history = createHistory();
  const notify = vi.fn<(notice: SceneFileNotice) => void>();
  const sceneFile = createSceneFile(scene, {
    history,
    selection: { select: () => {} } as unknown as Selection,
    placement: { cancel: () => {} } as unknown as PlacementTool,
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
  return { history, sceneFile, notify, addBox };
}

const meshCount = (text: string) =>
  (JSON.parse(text) as { meshes: unknown[] }).meshes.length;

beforeEach(() => {
  vi.mocked(saveTextFile).mockResolvedValue({
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

  test("쓰는 동안 한 편집은 파일에 없으므로 변경 있음으로 남는다", async () => {
    const { history, sceneFile, addBox } = setup();
    addBox();
    let finishWrite!: () => void;
    vi.mocked(saveTextFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ name: "scene.json", handle: null });
        }),
    );

    const saving = sceneFile.save();
    addBox(); // 핸들 저장은 모달이 없어서 쓰는 중에도 편집할 수 있다
    finishWrite();
    await saving;

    expect(meshCount(vi.mocked(saveTextFile).mock.calls[0][0])).toBe(1);
    expect(sceneFile.getState().dirty).toBe(true);
    history.undo(); // 파일에 쓴 시점으로 돌아오면 깨끗하다
    expect(sceneFile.getState().dirty).toBe(false);
  });

  test("저장 창을 취소하면 아무것도 바뀌지 않는다", async () => {
    const { sceneFile, addBox } = setup();
    addBox();
    vi.mocked(saveTextFile).mockResolvedValue(null);
    await sceneFile.save();
    expect(sceneFile.getState()).toMatchObject({ fileName: null, dirty: true });
  });
});

describe("열기 · 새 씬", () => {
  test("잘못된 파일은 알리고 씬을 그대로 둔다", async () => {
    const { sceneFile, notify, addBox } = setup();
    addBox();
    await sceneFile.save();
    vi.mocked(openTextFile).mockResolvedValue({
      name: "bad.json",
      text: "{broken",
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
