import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { KeyValueStore } from "@/lib/kv-store";

import {
  createAssetStore,
  MODEL_MIME_TYPE,
  modelPresetId,
} from "./asset-store";
import {
  AUTOSAVE_DELAY,
  type AutosaveRecord,
  type AutosaveStorage,
  createAutosave,
  createBrowserAutosaveStorage,
} from "./autosave";
import { createHistory } from "./history";
import { createSpawnMeshCommand } from "./mesh-commands";
import { addPresetMesh, findPreset } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import { createSceneFile } from "./scene-file";
import { clearEditorMeshes, getEditorMeshes } from "./scene-format";
import type { Selection } from "./selection";
import { createTestScene, fakeModelLoader } from "./test-scene";

const scene = createTestScene();
/** 테스트가 모두 같은 저장소를 쓴다 (모델 원본이 씬마다 하나) */
const sharedAssets = createAssetStore(scene, { loadModel: fakeModelLoader });

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
    assets: sharedAssets,
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

  test("앞 저장이 끝나기 전에 깨끗해지면 저장이 끝난 뒤에 지운다 (지우기가 먼저 가면 기록이 남는다)", async () => {
    const { history, storage, current, addBox } = setup();
    const save = vi.mocked(storage.save).getMockImplementation()!;
    let finishSave!: () => void;
    vi.mocked(storage.save).mockImplementationOnce(async (record) => {
      await new Promise<void>((resolve) => (finishSave = resolve));
      await save(record);
    });
    await settle();

    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY); // 저장 시작 (아직 안 끝남)
    history.undo();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    expect(storage.clear).not.toHaveBeenCalled();

    finishSave();
    await settle();
    expect(storage.clear).toHaveBeenCalledTimes(1);
    expect(current()).toBeNull();
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
    const content = sceneFile.serialize();
    clearEditorMeshes(scene);
    return { ...content, fileName: "level.json", savedAt: 1 };
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

    await autosave.recover();
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

  test("복구 중 예상 못 한 오류가 나도 알리고 지운 뒤 평소처럼 자동 저장한다", async () => {
    const record = await recordWithTwoBoxes();
    const { autosave, sceneFile, onError, current, storage, addBox } =
      setup(record);
    vi.spyOn(sceneFile, "restore").mockRejectedValue(new Error("boom"));
    await settle();

    await autosave.recover();
    expect(onError).toHaveBeenCalledWith(
      "자동 저장 기록을 복구하지 못했습니다",
      "boom",
    );
    expect(autosave.getState().pending).toBeNull();
    expect(current()).toBeNull();
    addBox();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  test("기록이 깨졌으면 알리고 지운다", async () => {
    const { autosave, onError, current } = setup({
      text: "{broken",
      assets: [],
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

describe("에셋이 있는 기록", () => {
  test("모델 객체를 복구하면 에셋을 다시 불러와 모델이 돌아온다", async () => {
    const { sceneFile, history } = setup();
    await settle();
    const asset = await sharedAssets.add({
      name: "chair.glb",
      type: "model",
      mimeType: MODEL_MIME_TYPE,
      bytes: new Uint8Array([3, 1, 4]),
    });
    const preset = findPreset(modelPresetId(asset.id))!;
    history.execute(
      createSpawnMeshCommand(
        scene,
        () => addPresetMesh(scene, preset),
        "추가",
        "chair",
      ),
    );
    const content = sceneFile.serialize();
    expect(content.assets).toEqual([asset]);
    clearEditorMeshes(scene);

    const restored = setup({ ...content, fileName: null, savedAt: 1 });
    await settle();
    await restored.autosave.recover();
    expect(getEditorMeshes(scene).map((mesh) => mesh.name)).toEqual([
      "chair 1",
    ]);
  });

  test("브라우저 저장소는 에셋을 id별 키에 한 번만 쓰고, 빠진 에셋은 지운다", async () => {
    const data = new Map<string, unknown>();
    const kv: KeyValueStore = {
      get: async <T>(key: string) => data.get(key) as T | undefined,
      set: vi.fn(
        async (key: string, value: unknown) => void data.set(key, value),
      ),
      delete: async (key: string) => void data.delete(key),
    };
    const storage = createBrowserAutosaveStorage(kv);
    const a = {
      id: "aaaaaaaaaaaaaaaa",
      name: "a.png",
      type: "image" as const,
      mimeType: "image/png",
      bytes: new Uint8Array([1]),
    };
    const b = { ...a, id: "bbbbbbbbbbbbbbbb", name: "b.png" };
    const record = (assets: (typeof a)[]) => ({
      text: "{}",
      assets,
      fileName: null,
      savedAt: 1,
    });

    await storage.save(record([a, b]));
    await storage.save(record([a, b]));
    expect(
      vi.mocked(kv.set).mock.calls.filter(([key]) => key.startsWith("asset:")),
    ).toHaveLength(2);

    await storage.save(record([a]));
    expect([...data.keys()].sort()).toEqual([
      "asset:aaaaaaaaaaaaaaaa",
      "autosave",
    ]);
    expect(await storage.load()).toMatchObject({ assets: [a] });

    await storage.clear();
    expect(data.size).toBe(0);
  });

  test("에셋 목록이 없는 이전 기록도 읽는다", async () => {
    const data = new Map<string, unknown>([
      ["autosave", { text: "{}", fileName: null, savedAt: 1 }],
    ]);
    const storage = createBrowserAutosaveStorage({
      get: async <T>(key: string) => data.get(key) as T | undefined,
      set: async () => {},
      delete: async () => {},
    });
    expect(await storage.load()).toEqual({
      text: "{}",
      fileName: null,
      savedAt: 1,
      assets: [],
    });
  });
});
