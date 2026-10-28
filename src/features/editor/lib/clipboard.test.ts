import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { describe, expect, test } from "vitest";

import {
  captureMeshSnapshot,
  createClipboard,
  createMeshFromSnapshot,
} from "./clipboard";
import { getMaterialValues } from "./mesh-material";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const material = { color: "#3366AA", metallic: 0.2, roughness: 0.8 };

function createSource() {
  const mesh = addPresetMesh(
    scene,
    findPreset("cone")!,
    Vector3.Zero(),
    material,
  );
  mesh.position.set(1, 0.5, 2);
  mesh.rotation.set(0, Math.PI / 2, 0);
  mesh.scaling.set(1, 2, 1);
  return mesh;
}

describe("clipboard", () => {
  test("원본을 해제해도 붙여넣을 수 있다 (메쉬가 아니라 데이터를 담는다)", () => {
    const clipboard = createClipboard();
    const source = createSource();
    expect(clipboard.copy(source)).toBe(true);
    source.dispose();

    const snapshot = clipboard.get()!;
    const pasted = createMeshFromSnapshot(
      scene,
      snapshot,
      new Vector3(3, 0, 0),
    );
    expect(pasted.name).toMatch(/^Cone \d+$/);
    expect(pasted.position.asArray()).toEqual([4, 0.5, 2]);
    expect(pasted.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(pasted.scaling.asArray()).toEqual([1, 2, 1]);
    expect(getMaterialValues(pasted)).toEqual(material);
  });

  test("붙여넣은 메쉬는 원본과 머티리얼을 공유하지 않는다", () => {
    const source = createSource();
    const copy = createMeshFromSnapshot(
      scene,
      captureMeshSnapshot(source)!,
      Vector3.Zero(),
    );
    expect(copy.material).not.toBe(source.material);
  });

  test("에디터 메쉬가 아니면 복사하지 않는다", () => {
    const clipboard = createClipboard();
    const plain = CreateBox("plain", {}, scene);
    expect(clipboard.copy(plain)).toBe(false);
    expect(clipboard.hasContent()).toBe(false);
  });
});
