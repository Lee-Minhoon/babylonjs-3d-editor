import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type AutosaveRecord, type AutosaveStorage } from "./autosave";
import { createEditorRuntime } from "./editor-runtime";
import { createSpawnMeshCommand } from "./mesh-commands";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

function memoryStorage() {
  let saved: AutosaveRecord | null = null;
  const storage: AutosaveStorage = {
    load: vi.fn(async () => saved),
    save: vi.fn(async (record: AutosaveRecord) => {
      saved = record;
    }),
    clear: vi.fn(async () => {
      saved = null;
    }),
  };
  return { storage, current: () => saved };
}

function setup() {
  const scene = createTestScene();
  const camera = new ArcRotateCamera("camera", 0, 1, 10, Vector3.Zero(), scene);
  const notify = vi.fn();
  const { storage, current } = memoryStorage();
  const { runtime, dispose } = createEditorRuntime(scene, camera, {
    notify,
    autosaveStorage: storage,
  });
  const spawnBox = () =>
    createSpawnMeshCommand(
      scene,
      () => addPresetMesh(scene, findPreset("box")!),
      "추가",
      "Box",
    );
  return { scene, runtime, dispose, notify, storage, current, spawnBox };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createEditorRuntime", () => {
  test("도구들이 서로 이어진다: 편집 → 변경 있음 → 자동 저장, 선택 → 기즈모", async () => {
    const { runtime, storage, current, spawnBox, dispose, scene } = setup();
    await vi.runAllTimersAsync(); // storage.load
    const command = spawnBox();
    runtime.history.execute(command);
    expect(runtime.sceneFile.getState().dirty).toBe(true);
    await vi.runAllTimersAsync();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(current()?.text).toContain('"presetId": "box"');

    runtime.selection.select(command.getMesh());
    expect(runtime.gizmo.getTarget()).toBe(command.getMesh());
    dispose();
    scene.dispose();
  });

  test("dispose: 구독을 모두 풀고, undo로 떼어둔 메쉬를 해제한다", async () => {
    const { runtime, storage, spawnBox, dispose, scene } = setup();
    await vi.runAllTimersAsync();
    const command = spawnBox();
    runtime.history.execute(command);
    runtime.history.undo();
    const mesh = command.getMesh()!;
    await vi.runAllTimersAsync();
    const saves = vi.mocked(storage.save).mock.calls.length;

    dispose();
    expect(mesh.isDisposed()).toBe(true);
    // Babylon의 observable.remove(observer)는 실제 제거를 setTimeout(0)으로 미룬다 (GizmoManager.dispose).
    // hasObservers()는 그 뒤 내부 카운터가 어긋나 true를 돌려주므로 배열 길이로 본다
    await vi.runAllTimersAsync();
    expect(scene.onPointerObservable.observers).toHaveLength(0);
    expect(scene.onBeforeRenderObservable.observers).toHaveLength(0);
    // 해제 뒤의 변경은 더 저장하지 않는다
    runtime.history.execute(spawnBox());
    await vi.runAllTimersAsync();
    expect(storage.save).toHaveBeenCalledTimes(saves);
    scene.dispose();
  });
});
