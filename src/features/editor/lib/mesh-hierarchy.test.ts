import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { describe, expect, test, vi } from "vitest";

import { captureMeshSnapshots, createMeshFromSnapshot } from "./clipboard";
import { addLightObject } from "./editor-lights";
import { createHistory } from "./history";
import { createAlignCommand, createDropToFloorCommand } from "./mesh-align";
import { createRemoveMeshCommand } from "./mesh-commands";
import { setMeshFlag } from "./mesh-flags";
import {
  buildSceneTree,
  createParentCommand,
  createSetParentCommand,
  getEditorChildren,
  getEditorParent,
  onHierarchyChange,
  setMeshParent,
  topLevelOnly,
} from "./mesh-hierarchy";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { exportGlb } from "./scene-export";
import {
  clearEditorMeshes,
  getEditorMeshes,
  loadSceneFile,
  parseSceneFile,
  SCENE_FILE_FORMAT,
  serializeScene,
  stringifySceneFile,
} from "./scene-format";
import { createTestScene } from "./test-scene";

const scene = createTestScene();

function box(x = 0, y = 0.5, z = 0) {
  const mesh = addPresetMesh(scene, findPreset("box")!);
  mesh.position.set(x, y, z);
  mesh.computeWorldMatrix(true);
  return mesh;
}

const worldPosition = (mesh: AbstractMesh) =>
  mesh
    .computeWorldMatrix(true)
    .getTranslation()
    .asArray()
    .map((n) => +n.toFixed(4));

/** parent 아래로 (월드 자세 유지) */
function parentTo(child: AbstractMesh, parent: AbstractMesh | null) {
  createParentCommand(child, parent)!.execute();
}

describe("부모 지정", () => {
  test("월드 자세를 유지하고 값은 부모 기준이 된다, undo하면 원래대로", () => {
    const parent = box(2, 0.5, 0);
    parent.rotation.y = Math.PI / 2;
    parent.scaling.setAll(2);
    const child = box(3, 0.5, 1);
    const listener = vi.fn();
    const unsubscribe = onHierarchyChange(listener);

    const command = createParentCommand(child, parent)!;
    expect(command.label).toBe(`${child.name} 부모 지정`);
    command.execute();
    expect(getEditorParent(child)).toBe(parent);
    expect(worldPosition(child)).toEqual([3, 0.5, 1]);
    expect(child.position.x).not.toBeCloseTo(3);
    expect(child.scaling.x).toBeCloseTo(0.5);
    expect(listener).toHaveBeenCalledTimes(1);

    // 부모를 옮기면 자식이 따라간다
    parent.position.x += 10;
    expect(worldPosition(child)[0]).toBeCloseTo(13);
    parent.position.x -= 10;

    command.undo();
    expect(getEditorParent(child)).toBeNull();
    expect(child.position.asArray()).toEqual([3, 0.5, 1]);
    expect(child.scaling.x).toBe(1);
    unsubscribe();
  });

  test("자기 자신·자기 자손 아래로는 못 간다, 같은 부모면 null", () => {
    const a = box();
    const b = box();
    parentTo(b, a);
    expect(createParentCommand(a, a)).toBeNull();
    expect(createParentCommand(a, b)).toBeNull();
    expect(createParentCommand(b, a)).toBeNull();
    expect(createParentCommand(b, null)?.label).toBe(`${b.name} 부모 해제`);
  });

  test("여러 개: 조상을 함께 고른 자식은 빼고 Command 하나 (undo 한 번)", () => {
    const target = box();
    const a = box(1);
    const aChild = box(1, 1.5);
    const b = box(2);
    parentTo(aChild, a);
    const history = createHistory();
    history.execute(createSetParentCommand([a, aChild, b, target], target)!);
    expect(history.getState().undoLabel).toBe("메쉬 2개 부모 지정");
    expect(getEditorParent(a)).toBe(target);
    expect(getEditorParent(aChild)).toBe(a);
    expect(getEditorParent(b)).toBe(target);
    history.undo();
    expect(getEditorParent(a)).toBeNull();
    expect(getEditorParent(b)).toBeNull();
  });

  test("topLevelOnly: 조상이 함께 들어 있으면 뺀다", () => {
    const a = box();
    const child = box();
    const grandchild = box();
    parentTo(child, a);
    parentTo(grandchild, child);
    expect(topLevelOnly([grandchild, a])).toEqual([a]);
    expect(topLevelOnly([grandchild, child])).toEqual([child]);
  });
});

describe("자식과 함께 하는 동작", () => {
  test("부모를 지우면 자식도 씬에서 빠지고, undo하면 함께 돌아온다", () => {
    const parent = box();
    const child = box();
    parentTo(child, parent);
    const history = createHistory();
    history.execute(createRemoveMeshCommand(scene, parent));
    expect(scene.meshes).not.toContain(child);
    history.undo();
    expect(scene.meshes).toContain(child);
    expect(getEditorParent(child)).toBe(parent);
  });

  test("먼저 따로 지운 자식은 부모 undo로 되살아나지 않는다", () => {
    const parent = box();
    const child = box();
    parentTo(child, parent);
    const history = createHistory();
    history.execute(createRemoveMeshCommand(scene, child));
    history.execute(createRemoveMeshCommand(scene, parent));
    history.undo();
    expect(scene.meshes).toContain(parent);
    expect(scene.meshes).not.toContain(child);
    expect(getEditorChildren(parent)).toEqual([]);
    history.undo();
    expect(getEditorChildren(parent)).toEqual([child]);
  });

  test("자식 조명도 부모와 함께 빠진다", () => {
    const parent = box();
    const lamp = addLightObject(scene, findPreset("point-light")!);
    setMeshParent(lamp, parent);
    const history = createHistory();
    history.execute(createRemoveMeshCommand(scene, parent));
    expect(scene.lights.some((light) => light.parent === lamp)).toBe(false);
    history.undo();
    expect(scene.lights.some((light) => light.parent === lamp)).toBe(true);
  });

  test("복사본은 자식까지 같은 계층으로 만들어진다 (맨 위는 월드 자세로 최상위에)", () => {
    const holder = box(5);
    const parent = box(1);
    const child = box(1, 2);
    parentTo(parent, holder);
    parentTo(child, parent);
    // 부모와 자식을 함께 골라도 묶음 하나
    const snapshots = captureMeshSnapshots([child, parent]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].children).toHaveLength(1);

    const copy = createMeshFromSnapshot(scene, snapshots[0], Vector3.Zero());
    expect(getEditorParent(copy)).toBeNull();
    expect(worldPosition(copy)).toEqual([1, 0.5, 0]);
    const [copiedChild] = getEditorChildren(copy);
    expect(copiedChild).not.toBe(child);
    expect(worldPosition(copiedChild)).toEqual([1, 2, 0]);
  });

  test("정렬·바닥에 붙이기: 자식은 월드 기준으로 옮기고, 부모와 함께 고르면 부모만", () => {
    const local = createTestScene();
    const make = (x: number, y: number) => {
      const mesh = addPresetMesh(local, findPreset("box")!);
      mesh.position.set(x, y, 0);
      return mesh;
    };
    const parent = make(0, 3);
    parent.rotation.z = Math.PI / 2;
    parent.scaling.set(2, 1, 1);
    const child = make(0, 5);
    const other = make(10, 0.5);
    parentTo(child, parent);

    const align = createAlignCommand([child, other], "x", "max")!;
    align.execute();
    expect(worldPosition(child)[0]).toBeCloseTo(10);
    align.undo();

    // 부모만 내려가고 자식은 따라간다 (부모가 자기 자식 위에 올라가지 않는다)
    createDropToFloorCommand([child, parent])!.execute();
    parent.computeWorldMatrix(true);
    expect(parent.getBoundingInfo().boundingBox.minimumWorld.y).toBeCloseTo(0);
    expect(worldPosition(child)[1]).toBeCloseTo(3);
    local.dispose();
  });
});

describe("씬 목록 트리", () => {
  test("부모 → 자식 순으로 들여 쓰고, 접은 부모의 자손은 뺀다", () => {
    const local = createTestScene();
    const make = () => addPresetMesh(local, findPreset("box")!);
    const [a, b, c, d] = [make(), make(), make(), make()];
    setMeshParent(c, a);
    setMeshParent(d, c);
    const meshes = getEditorMeshes(local);
    const rows = (collapsed?: Set<AbstractMesh>) =>
      buildSceneTree(meshes, getEditorParent, collapsed).map(
        ({ mesh, depth, childCount }) => [mesh.name, depth, childCount],
      );
    expect(rows()).toEqual([
      [a.name, 0, 1],
      [c.name, 1, 1],
      [d.name, 2, 0],
      [b.name, 0, 0],
    ]);
    expect(rows(new Set([c]))).toEqual([
      [a.name, 0, 1],
      [c.name, 1, 1],
      [b.name, 0, 0],
    ]);
    local.dispose();
  });
});

describe("씬 파일의 부모", () => {
  test("부모 번호와 부모 기준 값이 그대로 돌아온다 (부모가 뒤에 나와도)", () => {
    const local = createTestScene();
    const child = addPresetMesh(local, findPreset("sphere")!);
    const parent = addPresetMesh(local, findPreset("box")!);
    parent.position.set(2, 0, 0);
    child.position.set(1, 0, 0);
    setMeshParent(child, parent);

    const file = serializeScene(local);
    expect(file.meshes.map((mesh) => mesh.parent)).toEqual([1, null]);
    const text = stringifySceneFile(file);
    clearEditorMeshes(local);
    expect(getEditorMeshes(local)).toEqual([]);

    loadSceneFile(local, parseSceneFile(text));
    const [loadedChild, loadedParent] = getEditorMeshes(local);
    expect(getEditorParent(loadedChild)).toBe(loadedParent);
    expect(loadedChild.position.x).toBe(1);
    expect(worldPosition(loadedChild)[0]).toBeCloseTo(3);
    local.dispose();
  });

  const entry = {
    presetId: "box",
    name: "Box 1",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scaling: [1, 1, 1],
    material: null,
  };
  const file = (version: number, parents: unknown[]) =>
    JSON.stringify({
      format: SCENE_FILE_FORMAT,
      version,
      meshes: parents.map((parent) =>
        parent === undefined ? entry : { ...entry, parent },
      ),
    });

  test("v6 파일은 모두 최상위", () => {
    expect(
      parseSceneFile(file(6, [undefined, undefined])).meshes.map(
        (mesh) => mesh.parent,
      ),
    ).toEqual([null, null]);
  });

  test("자기 자신·범위 밖·순환은 오류", () => {
    expect(() => parseSceneFile(file(7, [0]))).toThrow("parent");
    expect(() => parseSceneFile(file(7, [5, null]))).toThrow("parent");
    expect(() => parseSceneFile(file(7, [1.5, null]))).toThrow("parent");
    expect(() => parseSceneFile(file(7, [1, 0]))).toThrow("순환");
  });
});

describe("내보내기", () => {
  test("숨긴 부모 아래의 메쉬도 월드 자리로 나가고, 씬은 그대로다", async () => {
    const local = createTestScene();
    const parent = addPresetMesh(local, findPreset("box")!);
    parent.position.set(5, 0, 0);
    const child = addPresetMesh(local, findPreset("sphere")!);
    child.position.set(1, 0, 0);
    setMeshParent(child, parent);
    setMeshFlag(parent, "hidden", true);

    const blob = await exportGlb(local, "scene");
    const view = new DataView(await blob.arrayBuffer());
    const json = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(view.buffer, 20, view.getUint32(12, true)),
      ),
    ) as { nodes: { name: string; translation?: number[] }[] };
    const node = json.nodes.find(({ name }) => name === child.name)!;
    // X 반전 (왼손 → 오른손)
    expect(node.translation).toEqual([-6, 0, 0]);
    expect(getEditorParent(child)).toBe(parent);
    expect(child.position.x).toBe(1);
    local.dispose();
  });
});
