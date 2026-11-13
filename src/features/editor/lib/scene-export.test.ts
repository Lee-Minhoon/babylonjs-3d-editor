import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { describe, expect, test } from "vitest";

import { setMeshFlag } from "./mesh-flags";
import { setMeshParent } from "./mesh-hierarchy";
import { MATERIAL_DEFAULTS } from "./mesh-material";
import { addPresetMesh, findPreset } from "./mesh-presets";
import {
  exportBaseName,
  exportGlb,
  liftOutOfSkippedParents,
} from "./scene-export";
import { createTestScene } from "./test-scene";

/** GLB의 JSON 청크 (헤더 12바이트 → 청크 길이·종류 → JSON) */
async function readGlbJson(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer());
  expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
  const length = view.getUint32(12, true);
  const json = new TextDecoder().decode(
    new Uint8Array(view.buffer, 20, length),
  );
  return JSON.parse(json) as {
    nodes: { name: string; mesh?: number; translation?: number[] }[];
    extensionsUsed?: string[];
    materials: {
      alphaMode?: string;
      emissiveFactor?: number[];
      extensions?: Record<string, unknown>;
      pbrMetallicRoughness: {
        baseColorFactor: number[];
        metallicFactor?: number;
        roughnessFactor: number;
      };
    }[];
  };
}

describe("GLB 내보내기", () => {
  test("보이는 에디터 메쉬만, 이름·위치·PBR 값과 함께", async () => {
    const scene = createTestScene();
    new ArcRotateCamera("camera", 0, 1, 10, Vector3.Zero(), scene);
    CreateGround("__grid", { width: 10, height: 10 }, scene);
    new TransformNode("__pivot", scene);
    const box = addPresetMesh(scene, findPreset("box")!, {
      ...MATERIAL_DEFAULTS,
      color: "#FFFFFF",
      metallic: 1,
      roughness: 0.25,
    });
    box.position.set(1, 0.5, 2);
    const hidden = addPresetMesh(scene, findPreset("sphere")!);
    setMeshFlag(hidden, "hidden", true);
    addPresetMesh(scene, findPreset("cone")!);

    const gltf = await readGlbJson(await exportGlb(scene, "scene"));
    expect(gltf.nodes.map((node) => node.name)).toEqual(["Box 1", "Cone 1"]);
    const boxNode = gltf.nodes[0];
    // 왼손(Babylon) → 오른손(glTF): Babylon 규칙대로 X가 반전된다 (Babylon 로더로 열면 원래 자리)
    expect(boxNode.translation).toEqual([-1, 0.5, 2]);

    const pbr = gltf.materials[0].pbrMetallicRoughness;
    expect(pbr.baseColorFactor.slice(0, 3)).toEqual([1, 1, 1]);
    // glTF 기본값(1)이면 생략된다
    expect(pbr.metallicFactor ?? 1).toBeCloseTo(1);
    expect(pbr.roughnessFactor).toBeCloseTo(0.25);
    scene.dispose();
  });

  test("숨긴 부모 아래 메쉬는 내보내는 동안만 올리고, 그 사이의 편집은 덮어쓰지 않는다", () => {
    const scene = createTestScene();
    const parent = addPresetMesh(scene, findPreset("box")!);
    parent.position.set(5, 0, 0);
    setMeshFlag(parent, "hidden", true);
    const child = addPresetMesh(scene, findPreset("sphere")!);
    setMeshParent(child, parent);
    child.position.set(0.1, 0.2, 0.3);
    const untouched = addPresetMesh(scene, findPreset("cone")!);
    setMeshParent(untouched, parent);
    untouched.position.set(0.1, 0.2, 0.3);

    const restore = liftOutOfSkippedParents([child, untouched]);
    expect(child.parent).toBeNull();
    expect(child.position.x).toBeCloseTo(5.1);
    // 직렬화 중에 사용자가 옮겼다 (기즈모·패널은 월드 자세로 편집한다)
    child.position.set(6, 7, 0);
    restore();

    expect(child.parent).toBe(parent);
    expect(child.getAbsolutePosition().asArray()).toEqual([6, 7, 0]);
    // 안 바뀐 메쉬는 원래 값 그대로 (행렬 분해 오차 없이)
    expect(untouched.parent).toBe(parent);
    expect(untouched.position.asArray()).toEqual([0.1, 0.2, 0.3]);
    scene.dispose();
  });
});

describe("GLB 머티리얼 확장", () => {
  test("발광색·불투명도·조명 무시가 glTF 값으로 나간다", async () => {
    const scene = createTestScene();
    new ArcRotateCamera("camera", 0, 1, 10, Vector3.Zero(), scene);
    addPresetMesh(scene, findPreset("box")!, {
      ...MATERIAL_DEFAULTS,
      color: "#FFFFFF",
      emissive: "#FF0000",
      alpha: 0.5,
      unlit: true,
    });

    const gltf = await readGlbJson(await exportGlb(scene, "scene"));
    const [material] = gltf.materials;
    expect(material.emissiveFactor).toEqual([1, 0, 0]);
    expect(material.alphaMode).toBe("BLEND");
    expect(material.pbrMetallicRoughness.baseColorFactor[3]).toBeCloseTo(0.5);
    expect(material.extensions).toHaveProperty("KHR_materials_unlit");
    expect(gltf.extensionsUsed).toContain("KHR_materials_unlit");
    scene.dispose();
  });
});

describe("내보낼 파일 이름", () => {
  test.each([
    [null, "scene"],
    ["castle.json", "castle"],
    ["Castle.JSON", "Castle"],
    ["castle.zip", "castle"],
    ["notes.txt", "notes.txt"],
    [".json", "scene"],
  ])("%s → %s", (fileName, expected) => {
    expect(exportBaseName(fileName)).toBe(expected);
  });
});
