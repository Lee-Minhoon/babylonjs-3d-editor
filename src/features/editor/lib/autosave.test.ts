import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  AUTOSAVE_DELAY,
  type AutosaveRecord,
  type AutosaveStorage,
  createAutosave,
} from "./autosave";
import { createHistory } from "./history";
import { createSpawnMeshCommand } from "./mesh-commands";
import { addPresetMesh, findPreset } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import { createSceneFile } from "./scene-file";
import { clearEditorMeshes, getEditorMeshes } from "./scene-format";
import type { Selection } from "./selection";
import { createTestScene } from "./test-scene";

const scene = createTestScene();

/** 메모리 저장소 + 호출 기록 */
function memoryStorage(initial: AutosaveRecord | null = null) {
  let saved = initial;
  const storage: AutosaveStorage = {
    load: vi.fn(async () => saved),
    save: vi.fn(async (record: AutosaveRecord) => void (saved = record)),
    clear: vi.fn(async () => void (saved = null)),
  };
  return { storage, current: () => saved };
}

function setup(initial: AutosaveRecord | null = null) {
  const history = createHistory();
  const sceneFile = createSceneFile(scene, {
    history,
    selection: { select: () => {} } as unknown as Selection,
    placement: { cancel: () => {} } as unknown as PlacementTool,
    notify: () => {},
  });
  const { storage, current } = memoryStorage(initial);
  const onError = vi.fn();
  const autosave = createAutosave({ sceneFile, storage, onError });
  const addBox = () =>
    history.execute(
      createSpawnMeshCommand(
        scene,
        () => addPresetMesh(scene, findPreset("box")!),
        "추가",
        "Box",
      ),
    );
  return { history, sceneFile, storage, current, autosave, onError, addBox };
}

/** storage.load() 같은 대기 중인 Promise를 처리한다 */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  clearEditorMeshes(scene);
});

describe("자동 저장", () => {
  test("변경 후 delay가 지나면 남기고, 저장 시점으로 돌아가면 지운다", async () => {
    const { history, storage, current, addBox } = setup();
    await settle();

    addBox();
    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 1);
    expect(storage.save).not.toHaveBeenCalled(); // 연속 변경은 마지막 것 기준으로 한 번
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(current()!.text).meshes).toHaveLength(2);

    history.undo();
    history.undo();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    expect(current()).toBeNull();
  });

  test("남긴 기록이 없으면 깨끗해져도 저장소를 건드리지 않는다", async () => {
    const { history, storage, addBox } = setup();
    await settle();
    addBox();
    history.undo(); // delay 안에 되돌림 → 남길 것도 지울 것도 없다
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
  });

  test("flush는 기다리지 않고 바로 남긴다 (탭이 숨겨질 때)", async () => {
    const { storage, autosave, addBox } = setup();
    await settle();
    addBox();
    await autosave.flush();
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  test("저장소 오류는 한 번만 알린다", async () => {
    const { storage, onError, addBox } = setup();
    vi.mocked(storage.save).mockRejectedValue(new Error("quota"));
    await settle();
    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("복구", () => {
  async function recordWithTwoBoxes(): Promise<AutosaveRecord> {
    const { sceneFile, addBox } = setup();
    await settle();
    addBox();
    addBox();
    const text = sceneFile.serialize();
    clearEditorMeshes(scene);
    return { text, fileName: "level.json", savedAt: 1 };
  }

  test("기록이 있으면 묻는 동안 아무것도 쓰지 않는다 (빈 씬이 기록을 지우면 안 됨)", async () => {
    const record = await recordWithTwoBoxes();
    const { autosave, storage, current, addBox } = setup(record);
    await settle();
    expect(autosave.getState().pending).toEqual({
      fileName: "level.json",
      savedAt: 1,
    });

    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(current()).toBe(record);
  });

  test("복구하면 씬을 되살리고, 파일로 저장할 때까지 변경 있음 상태", async () => {
    const record = await recordWithTwoBoxes();
    const { autosave, sceneFile, history } = setup(record);
    await settle();

    autosave.recover();
    expect(getEditorMeshes(scene).map((mesh) => mesh.name)).toEqual([
      "Box 1",
      "Box 2",
    ]);
    expect(sceneFile.getState()).toMatchObject({
      fileName: "level.json",
      dirty: true,
    });
    expect(history.getState().undoLabel).toBeNull();
    expect(autosave.getState().pending).toBeNull();
  });

  test("버리면 기록을 지우고 평소처럼 자동 저장한다", async () => {
    const record = await recordWithTwoBoxes();
    const { autosave, current, storage, addBox } = setup(record);
    await settle();

    autosave.discard();
    await settle();
    expect(current()).toBeNull();
    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  test("기록이 깨졌으면 알리고 지운다", async () => {
    const { autosave, onError, current } = setup({
      text: "{broken",
      fileName: null,
      savedAt: 1,
    });
    await settle();
    autosave.recover();
    await settle();
    expect(onError).toHaveBeenCalledWith(
      "자동 저장 기록을 복구하지 못했습니다",
      expect.any(String),
    );
    expect(current()).toBeNull();
  });
});
