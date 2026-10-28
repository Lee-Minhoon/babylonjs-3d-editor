import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { afterEach, describe, expect, test } from "vitest";

import { getMaterialValues } from "./mesh-material";
import { addPresetMesh, findPreset } from "./mesh-presets";
import {
  clearEditorMeshes,
  getEditorMeshes,
  loadSceneFile,
  parseSceneFile,
  SCENE_FILE_FORMAT,
  SCENE_FILE_VERSION,
  SceneFileError,
  serializeScene,
  stringifySceneFile,
} from "./scene-format";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
afterEach(() => clearEditorMeshes(scene));

const gold = { color: "#D4AF37", metallic: 1, roughness: 0.15 };

function buildScene() {
  const box = addPresetMesh(scene, findPreset("box")!, Vector3.Zero(), gold);
  box.position.set(1, 0.5, -2);
  box.rotation.set(0, Math.PI / 4, 0);
  box.scaling.set(1, 2, 1);
  addPresetMesh(scene, findPreset("sphere")!, new Vector3(3, 0, 0));
}

const file = (meshes: unknown[], version: number = SCENE_FILE_VERSION) =>
  JSON.stringify({ format: SCENE_FILE_FORMAT, version, meshes });

const validMesh = {
  presetId: "box",
  name: "Box 1",
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scaling: [1, 1, 1],
  material: gold,
};

describe("저장 → 열기 왕복", () => {
  test("프리셋·이름·변형·머티리얼이 그대로 돌아온다", () => {
    buildScene();
    const text = stringifySceneFile(serializeScene(scene));
    clearEditorMeshes(scene);
    expect(getEditorMeshes(scene)).toHaveLength(0);

    loadSceneFile(scene, parseSceneFile(text));
    const [box, sphere] = getEditorMeshes(scene);
    expect(box.name).toBe("Box 1");
    expect(box.position.asArray()).toEqual([1, 0.5, -2]);
    expect(box.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(box.scaling.asArray()).toEqual([1, 2, 1]);
    expect(getMaterialValues(box)).toEqual(gold);
    expect(sphere.name).toBe("Sphere 1");
  });

  test("회전은 도 단위, 숫자 배열은 한 줄로 저장한다", () => {
    buildScene();
    const text = stringifySceneFile(serializeScene(scene));
    expect(text).toContain('"rotation": [0, 45, 0]');
    expect(text).toContain('"position": [1, 0.5, -2]');
  });

  test("회전 기즈모가 만든 쿼터니언도 오일러로 저장한다", () => {
    buildScene();
    const [box] = getEditorMeshes(scene);
    box.rotationQuaternion = box.rotation.toQuaternion();
    const [saved] = serializeScene(scene).meshes;
    expect(saved.rotation[1]).toBeCloseTo(45);
  });

  test("연 뒤 새로 만드는 메쉬는 파일 속 번호 다음부터", () => {
    loadSceneFile(
      scene,
      parseSceneFile(file([{ ...validMesh, name: "Box 7" }])),
    );
    const next = addPresetMesh(scene, findPreset("box")!, Vector3.Zero());
    expect(next.name).toBe("Box 8");
  });
});

describe("v1 파일 변환", () => {
  test("color를 material.color로 옮기고 메탈릭·거칠기는 기본값", () => {
    const { material: _material, ...rest } = validMesh;
    const parsed = parseSceneFile(
      file(
        [
          { ...rest, color: "#FF0000" },
          { ...rest, name: "Box 2", color: null },
        ],
        1,
      ),
    );
    expect(parsed.version).toBe(SCENE_FILE_VERSION);
    expect(parsed.meshes[0].material).toEqual({
      color: "#FF0000",
      metallic: 0,
      roughness: 0.5,
    });
    expect(parsed.meshes[1].material).toBeNull();
  });
});

describe("잘못된 파일은 SceneFileError (씬을 바꾸기 전에 거른다)", () => {
  test.each([
    ["JSON이 아님", "{not json", "JSON 형식이 아닙니다"],
    ["다른 형식", JSON.stringify({ format: "other" }), "씬 파일이 아닙니다"],
    ["더 새로운 버전", file([], SCENE_FILE_VERSION + 1), "더 새로운 버전"],
    [
      "meshes 없음",
      JSON.stringify({ format: SCENE_FILE_FORMAT, version: 2 }),
      "meshes",
    ],
    ["모르는 프리셋", file([{ ...validMesh, presetId: "teapot" }]), '"teapot"'],
    ["빈 이름", file([{ ...validMesh, name: " " }]), "name"],
    ["벡터 길이", file([{ ...validMesh, position: [0, 0] }]), "position"],
    [
      "숫자가 아닌 값",
      file([{ ...validMesh, scaling: [1, "2", 1] }]),
      "scaling",
    ],
    [
      "메탈릭 범위",
      file([{ ...validMesh, material: { ...gold, metallic: 2 } }]),
      "metallic",
    ],
    [
      "색 형식",
      file([{ ...validMesh, material: { ...gold, color: "red" } }]),
      "color",
    ],
  ])("%s", (_, text, message) => {
    expect(() => parseSceneFile(text)).toThrow(SceneFileError);
    expect(() => parseSceneFile(text)).toThrow(message);
  });
});
