import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { afterEach, describe, expect, test, vi } from "vitest";

import { captureMeshSnapshot, createMeshFromSnapshot } from "./clipboard";
import { createHistory } from "./history";
import {
  createLinkCommand,
  createMaterialLibrary,
  createRenameMaterialCommand,
  createSharedMaterialCommand,
  createUnlinkCommand,
  getLibraryId,
} from "./material-library";
import { createRemoveMeshCommand } from "./mesh-commands";
import {
  applyMaterialValues,
  getMaterialValues,
  MATERIAL_DEFAULTS,
  onMaterialChange,
} from "./mesh-material";
import { addPresetMesh, findPreset } from "./mesh-presets";
import {
  clearEditorMeshes,
  getEditorMeshes,
  loadSceneFile,
  parseSceneFile,
  SceneFileError,
  serializeScene,
  stringifySceneFile,
} from "./scene-format";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const library = createMaterialLibrary(scene);
afterEach(() => clearEditorMeshes(scene));

const red = { ...MATERIAL_DEFAULTS, color: "#D03030" };
const blue = { ...MATERIAL_DEFAULTS, color: "#3050D0" };
const box = (values = blue) => addPresetMesh(scene, findPreset("box")!, values);

describe("공유 머티리얼", () => {
  test("만들면 첫 메쉬의 값으로 모두 연결되고, 하나를 고치면 모두 바뀌고 모두에게 알린다", () => {
    const history = createHistory();
    const [a, b] = [box(red), box(blue)];
    history.execute(createSharedMaterialCommand(library, [a, b])!);

    expect(library.getEntries()).toEqual([
      { id: getLibraryId(a), name: "머티리얼 1" },
    ]);
    expect(a.material).toBe(b.material);
    expect(getMaterialValues(b)?.color).toBe("#D03030");

    const listener = vi.fn();
    const unsubscribe = onMaterialChange(b, listener);
    applyMaterialValues(a, { ...red, roughness: 0.9 });
    expect(getMaterialValues(b)?.roughness).toBe(0.9);
    expect(listener).toHaveBeenCalled();
    unsubscribe();

    // undo: 연결 전 각자의 머티리얼·값으로, 목록에서도 빠진다
    history.undo(); // 거칠기는 Command가 아니라 직접 적용했으므로 만들기 undo
    expect(getLibraryId(a)).toBeNull();
    expect(getMaterialValues(b)?.color).toBe("#3050D0");
    expect(library.getEntries()).toEqual([]);
    history.redo();
    expect(a.material).toBe(b.material);
    expect(library.getEntries()).toHaveLength(1);
  });

  test("연결 해제하면 지금 값의 전용 머티리얼 (다른 메쉬와 따로 바뀐다)", () => {
    const history = createHistory();
    const [a, b] = [box(red), box(blue)];
    history.execute(createSharedMaterialCommand(library, [a, b])!);
    history.execute(createUnlinkCommand([b])!);

    expect(getLibraryId(b)).toBeNull();
    expect(getMaterialValues(b)?.color).toBe("#D03030");
    applyMaterialValues(b, blue);
    expect(getMaterialValues(a)?.color).toBe("#D03030");
    expect(history.getState().undoLabel).toBe("Box 2 머티리얼 연결 해제");
  });

  test("다른 메쉬를 기존 항목에 연결 (이미 연결된 메쉬는 건너뛴다)", () => {
    const history = createHistory();
    const [a, b] = [box(red), box(blue)];
    history.execute(createSharedMaterialCommand(library, [a])!);
    const shared = library.find(getLibraryId(a)!)!;
    expect(createLinkCommand([a], shared)).toBeNull();
    history.execute(createLinkCommand([a, b], shared)!);
    expect(b.material).toBe(shared);
    expect(history.getState().undoLabel).toBe("Box 2 머티리얼 연결");
  });

  test("연결된 메쉬를 지워도 공유 머티리얼은 남고, 버려진 전용 머티리얼은 히스토리에서 빠질 때 해제", () => {
    const history = createHistory();
    const [a, b] = [box(red), box(blue)];
    const ownA = a.material!;
    history.execute(createSharedMaterialCommand(library, [a, b])!);
    const shared = a.material!;
    const remove = createRemoveMeshCommand(scene, a);
    history.execute(remove);
    history.clear(); // 지운 메쉬가 실제로 해제된다
    expect(a.isDisposed()).toBe(true);
    expect(scene.materials).toContain(shared);
    expect(b.material).toBe(shared);
    expect(scene.materials).not.toContain(ownA);
  });

  test("만들기를 되돌린 채 히스토리에서 빠지면 머티리얼을 해제하고, 적용된 채 빠지면 남긴다", () => {
    const history = createHistory();
    const a = box(red);
    history.execute(createSharedMaterialCommand(library, [a])!);
    const undone = a.material!;
    history.undo();
    history.execute(createSharedMaterialCommand(library, [a])!); // redo 스택이 버려진다
    const kept = a.material!;
    expect(scene.materials).not.toContain(undone);
    expect(scene.materials).toContain(kept);

    history.clear();
    expect(scene.materials).toContain(kept);
    expect(a.material).toBe(kept);
    expect(library.getEntries()).toHaveLength(1);
  });

  test("이름 바꾸기 (undo 가능, 같은 이름·빈 이름은 무시)", () => {
    const history = createHistory();
    const a = box();
    history.execute(createSharedMaterialCommand(library, [a])!);
    const id = getLibraryId(a)!;
    expect(createRenameMaterialCommand(library, id, "  ")).toBeNull();
    history.execute(
      createRenameMaterialCommand(library, id, " 빨간 플라스틱 ")!,
    );
    expect(library.getEntries()[0].name).toBe("빨간 플라스틱");
    history.undo();
    expect(library.getEntries()[0].name).toBe("머티리얼 1");
  });

  test("복사본은 같은 공유 머티리얼에 연결된다 (라이브러리에서 빠졌으면 값만)", () => {
    const history = createHistory();
    const a = box(red);
    history.execute(createSharedMaterialCommand(library, [a])!);
    const snapshot = captureMeshSnapshot(a)!;
    const copy = createMeshFromSnapshot(scene, snapshot, Vector3.Zero());
    expect(copy.material).toBe(a.material);

    clearEditorMeshes(scene); // 새 씬: 라이브러리도 비운다
    expect(library.getEntries()).toEqual([]);
    const later = createMeshFromSnapshot(scene, snapshot, Vector3.Zero());
    expect(getLibraryId(later)).toBeNull();
    expect(getMaterialValues(later)?.color).toBe("#D03030");
  });
});

describe("씬 파일", () => {
  test("쓰는 공유 머티리얼만 materials에, 메쉬는 materialRef — 열면 다시 같은 머티리얼", () => {
    const history = createHistory();
    const [a, b] = [box(red), box(blue)];
    box(blue);
    history.execute(createSharedMaterialCommand(library, [a, b])!);
    history.execute(
      createRenameMaterialCommand(library, getLibraryId(a)!, "빨간 플라스틱")!,
    );
    // 아무도 안 쓰는 항목은 저장하지 않는다
    history.execute(createSharedMaterialCommand(library, [box()])!);
    history.undo();

    const file = parseSceneFile(stringifySceneFile(serializeScene(scene)));
    expect(file.materials).toEqual([
      {
        id: getLibraryId(a),
        name: "빨간 플라스틱",
        material: expect.objectContaining({ color: "#D03030" }),
      },
    ]);
    expect(file.meshes.map((mesh) => mesh.materialRef)).toEqual([
      getLibraryId(a),
      getLibraryId(a),
      null,
      null,
    ]);

    clearEditorMeshes(scene);
    loadSceneFile(scene, file);
    const [x, y, z] = getEditorMeshes(scene);
    expect(x.material).toBe(y.material);
    expect(z.material).not.toBe(x.material);
    expect(library.getEntries().map((entry) => entry.name)).toEqual([
      "빨간 플라스틱",
    ]);
  });

  test("materials에 없는 materialRef는 SceneFileError", () => {
    const text = JSON.stringify({
      format: "babylonjs-3d-editor/scene",
      version: 8,
      materials: [],
      meshes: [
        {
          presetId: "box",
          name: "Box 1",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scaling: [1, 1, 1],
          material: red,
          materialRef: "nope",
        },
      ],
    });
    expect(() => parseSceneFile(text)).toThrow(SceneFileError);
    expect(() => parseSceneFile(text)).toThrow("materialRef");
  });
});

test("파일에서 연 번호 이름 뒤로 새 이름 번호가 이어진다", () => {
  const scene2 = createTestScene();
  const other = createMaterialLibrary(scene2);
  other.create(red, { id: "saved", name: "머티리얼 3" });
  expect(other.create(blue).name).toBe("머티리얼 4");
  other.dispose();
});
