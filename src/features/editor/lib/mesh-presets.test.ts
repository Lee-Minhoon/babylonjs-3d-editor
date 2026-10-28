import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { afterEach, describe, expect, test } from "vitest";

import {
  addPresetMesh,
  findPreset,
  getPresetId,
  isEditorMesh,
  MESH_PRESETS,
  resetMeshNames,
} from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
afterEach(() => {
  for (const mesh of [...scene.meshes]) mesh.dispose();
  resetMeshNames(scene);
});

const box = findPreset("box")!;
const sphere = findPreset("sphere")!;

describe("addPresetMesh", () => {
  test("이름 번호는 프리셋별로 1부터 증가한다", () => {
    const names = [box, box, sphere, box].map(
      (preset) => addPresetMesh(scene, preset, Vector3.Zero()).name,
    );
    expect(names).toEqual(["Box 1", "Box 2", "Sphere 1", "Box 3"]);
  });

  test("지운 메쉬의 번호를 다시 쓰지 않는다 (undo로 떼어둔 메쉬와 이름이 겹치지 않게)", () => {
    addPresetMesh(scene, box, Vector3.Zero()).dispose();
    expect(addPresetMesh(scene, box, Vector3.Zero()).name).toBe("Box 2");
  });

  test("저장된 이름으로 만들면 다음 번호가 그 뒤부터 이어진다", () => {
    addPresetMesh(scene, box, Vector3.Zero(), undefined, "Box 7");
    addPresetMesh(scene, box, Vector3.Zero(), undefined, "내 상자");
    expect(addPresetMesh(scene, box, Vector3.Zero()).name).toBe("Box 8");
  });

  test("밑면이 표면 점에 닿도록 restY만큼 올린다", () => {
    const torus = findPreset("torus")!;
    const mesh = addPresetMesh(scene, torus, new Vector3(1, 2, 3));
    expect(mesh.position.asArray()).toEqual([1, 2 + torus.restY, 3]);
  });

  test("에디터 메쉬 표시와 프리셋 id", () => {
    const mesh = addPresetMesh(scene, sphere, Vector3.Zero());
    expect(isEditorMesh(mesh)).toBe(true);
    expect(getPresetId(mesh)).toBe("sphere");
  });

  test("프리셋 id는 겹치지 않는다", () => {
    const ids = MESH_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
