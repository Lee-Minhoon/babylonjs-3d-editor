import { afterEach, describe, expect, test, vi } from "vitest";

import { createHistory } from "./history";
import {
  createRemoveMeshCommand,
  createSpawnMeshCommand,
} from "./mesh-commands";
import { getEditorChildren, setMeshParent } from "./mesh-hierarchy";
import { setMeshName } from "./mesh-name";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { clearEditorMeshes } from "./scene-format";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
afterEach(() => clearEditorMeshes(scene));

const box = () => addPresetMesh(scene, findPreset("box")!);
const spawnBox = () =>
  createSpawnMeshCommand(scene, box, "추가", findPreset("box")!.label);

describe("createSpawnMeshCommand", () => {
  test("첫 execute에서 한 번만 만들고, undo/redo는 같은 객체를 떼었다 붙인다", () => {
    const spawn = vi.fn(box);
    const command = createSpawnMeshCommand(scene, spawn, "추가", "Box");
    expect(command.label).toBe("Box 추가"); // 만들기 전엔 프리셋 이름
    expect(command.getMesh()).toBeNull();

    command.execute();
    const mesh = command.getMesh()!;
    expect(command.label).toBe(`${mesh.name} 추가`);
    expect(scene.meshes).toContain(mesh);

    command.undo();
    expect(scene.meshes).not.toContain(mesh);
    expect(mesh.isDisposed()).toBe(false);

    command.execute();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(command.getMesh()).toBe(mesh);
    expect(scene.meshes).toContain(mesh);
  });

  test("라벨은 만들 때의 이름으로 굳는다 — 나중에 이름을 바꿔도 그대로", () => {
    const command = spawnBox();
    command.execute();
    const mesh = command.getMesh()!;
    const label = command.label;
    setMeshName(mesh, "Wall");
    expect(command.label).toBe(label);
  });

  test("dispose: 씬 밖(undo 상태)일 때만 해제한다 — 씬에 있으면 씬이 소유한다", () => {
    const inScene = spawnBox();
    inScene.execute();
    inScene.dispose?.();
    expect(inScene.getMesh()!.isDisposed()).toBe(false);

    const undone = spawnBox();
    undone.execute();
    const mesh = undone.getMesh()!;
    const material = mesh.material!;
    undone.undo();
    undone.dispose?.();
    expect(mesh.isDisposed()).toBe(true);
    expect(scene.materials).not.toContain(material); // 전용 머티리얼도 함께
  });

  test("undo는 그때 씬에 있는 자손까지 함께 떼고, redo로 함께 돌아온다", () => {
    const command = spawnBox();
    command.execute();
    const parent = command.getMesh()!;
    const child = box();
    setMeshParent(child, parent);

    command.undo();
    expect(scene.meshes).not.toContain(child);
    command.execute();
    expect(scene.meshes).toContain(child);
    expect(getEditorChildren(parent)).toEqual([child]);
  });
});

describe("createRemoveMeshCommand", () => {
  test("execute로 떼고 undo로 붙인다 (라벨은 동사 선택)", () => {
    const mesh = box();
    const history = createHistory();
    history.execute(createRemoveMeshCommand(scene, mesh, "잘라내기"));
    expect(history.getState().undoLabel).toBe(`${mesh.name} 잘라내기`);
    expect(scene.meshes).not.toContain(mesh);
    expect(mesh.isDisposed()).toBe(false);
    history.undo();
    expect(scene.meshes).toContain(mesh);
  });

  test("dispose: 떼어둔 상태로 히스토리에서 빠질 때만 해제한다", () => {
    const kept = box();
    const keptCommand = createRemoveMeshCommand(scene, kept);
    keptCommand.execute();
    keptCommand.undo();
    keptCommand.dispose?.();
    expect(kept.isDisposed()).toBe(false);

    const removed = box();
    const removedCommand = createRemoveMeshCommand(scene, removed);
    removedCommand.execute();
    removedCommand.dispose?.();
    expect(removed.isDisposed()).toBe(true);
  });

  test("히스토리 최대 개수를 넘겨 빠진 삭제 Command는 메쉬를 실제로 해제한다", () => {
    const history = createHistory({ limit: 1 });
    const first = box();
    history.execute(createRemoveMeshCommand(scene, first));
    history.execute(createRemoveMeshCommand(scene, box()));
    expect(first.isDisposed()).toBe(true);
  });
});
