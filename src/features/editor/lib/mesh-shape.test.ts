import { describe, expect, test, vi } from "vitest";

import {
  createAssetStore,
  MODEL_MIME_TYPE,
  modelPresetId,
} from "./asset-store";
import { captureMeshSnapshot, createMeshFromSnapshot } from "./clipboard";
import { addPresetObject } from "./editor-lights";
import { addPresetMesh, findPreset, getShapeParams } from "./mesh-presets";
import {
  applyShapeParams,
  createShapeCommand,
  isSameShape,
  onShapeChange,
  shapeProperty,
} from "./mesh-shape";
import { createTestScene, fakeModelLoader } from "./test-scene";

const scene = createTestScene();

const vertexCount = (mesh: { getTotalVertices(): number }) =>
  mesh.getTotalVertices();

describe("모양 파라미터", () => {
  test("새 메쉬는 기본 모양 값을 가진다 (예전 모양과 같음)", () => {
    const cone = addPresetMesh(scene, findPreset("cone")!);
    expect(getShapeParams(cone)).toEqual({
      diameterTop: 0,
      diameterBottom: 1,
      tessellation: 24,
    });
    expect(getShapeParams(addPresetMesh(scene, findPreset("box")!))).toEqual(
      {},
    );
  });

  test("같은 메쉬의 정점을 다시 만들고 바운딩 박스도 따라간다", () => {
    const cylinder = addPresetMesh(scene, findPreset("cylinder")!);
    const before = vertexCount(cylinder);
    const listener = vi.fn();
    onShapeChange(cylinder, listener);

    applyShapeParams(cylinder, {
      diameterTop: 2,
      diameterBottom: 2,
      tessellation: 6,
    });
    expect(vertexCount(cylinder)).toBeLessThan(before);
    expect(cylinder.getBoundingInfo().boundingBox.maximum.x).toBeCloseTo(1, 1);
    expect(getShapeParams(cylinder)).toMatchObject({ tessellation: 6 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("빠진 키는 기본값, 모르는 키는 버린다", () => {
    const torus = addPresetMesh(scene, findPreset("torus")!);
    applyShapeParams(torus, { thickness: 0.1, unknown: 3 });
    expect(getShapeParams(torus)).toEqual({ thickness: 0.1, tessellation: 48 });
  });

  test("Command undo/redo", () => {
    const sphere = addPresetMesh(scene, findPreset("sphere")!);
    const before = getShapeParams(sphere)!;
    const command = createShapeCommand(sphere, before, { segments: 4 });
    expect(command.label).toBe(`${sphere.name} 모양`);
    command.execute();
    const low = vertexCount(sphere);
    command.undo();
    expect(getShapeParams(sphere)).toEqual(before);
    expect(vertexCount(sphere)).toBeGreaterThan(low);
  });

  test("복사본은 원본의 모양을 따라간다", () => {
    const capsule = addPresetMesh(scene, findPreset("capsule")!);
    applyShapeParams(capsule, { radius: 0.1 });
    const copy = createMeshFromSnapshot(
      scene,
      captureMeshSnapshot(capsule)!,
      capsule.position.clone(),
    );
    expect(getShapeParams(copy)).toEqual({ radius: 0.1 });
    expect(vertexCount(copy)).toBe(vertexCount(capsule));
  });

  test("모델 객체에는 적용하지 않는다 (원본·다른 복제본과 지오메트리를 공유한다)", async () => {
    const store = createAssetStore(scene, { loadModel: fakeModelLoader });
    const asset = await store.add({
      name: "m.glb",
      type: "model",
      mimeType: MODEL_MIME_TYPE,
      bytes: new Uint8Array([1, 2, 3]),
    });
    const preset = findPreset(modelPresetId(asset.id))!;
    const object = addPresetObject(scene, preset);
    const sibling = addPresetObject(scene, preset);
    expect(sibling.subMeshes).toHaveLength(2);
    expect(shapeProperty.get(object)).toBeNull();
    applyShapeParams(object, {});
    expect(sibling.subMeshes).toHaveLength(2);
    store.dispose();
  });

  test("isSameShape", () => {
    expect(isSameShape({ a: 1 }, { a: 1 })).toBe(true);
    expect(isSameShape({ a: 1 }, { a: 2 })).toBe(false);
    expect(isSameShape({ a: 1 }, {})).toBe(false);
  });
});
