import { afterEach, describe, expect, test } from "vitest";

import { getMeshFlag, setMeshFlag } from "./mesh-flags";
import { getMaterialValues, MATERIAL_DEFAULTS } from "./mesh-material";
import { addPresetMesh, findPreset, getShapeParams } from "./mesh-presets";
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
import {
  applySceneSettings,
  DEFAULT_SCENE_SETTINGS,
  getSceneSettings,
} from "./scene-settings";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
afterEach(() => {
  clearEditorMeshes(scene);
  applySceneSettings(scene, DEFAULT_SCENE_SETTINGS);
});

const gold = {
  ...MATERIAL_DEFAULTS,
  color: "#D4AF37",
  metallic: 1,
  roughness: 0.15,
};

function buildScene() {
  const box = addPresetMesh(scene, findPreset("box")!, gold);
  box.position.set(1, 0.5, -2);
  box.rotation.set(0, Math.PI / 4, 0);
  box.scaling.set(1, 2, 1);
  addPresetMesh(scene, findPreset("sphere")!).position.set(3, 0.5, 0);
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

  test("숫자 배열처럼 보이는 이름도 글자 그대로 저장한다", () => {
    addPresetMesh(scene, findPreset("box")!, gold, "[ 1, 2 ]");
    addPresetMesh(scene, findPreset("box")!, gold, '"position": [\n 1 ]');
    const text = stringifySceneFile(serializeScene(scene));
    expect(text).toContain('"name": "[ 1, 2 ]"');
    expect(parseSceneFile(text).meshes.map((mesh) => mesh.name)).toEqual([
      "[ 1, 2 ]",
      '"position": [\n 1 ]',
    ]);
  });

  test("회전 기즈모가 만든 쿼터니언도 오일러로 저장한다", () => {
    buildScene();
    const [box] = getEditorMeshes(scene);
    box.rotationQuaternion = box.rotation.toQuaternion();
    const [saved] = serializeScene(scene).meshes;
    expect(saved.rotation[1]).toBeCloseTo(45);
  });

  test("숨김·잠금이 그대로 돌아온다", () => {
    buildScene();
    const [box, sphere] = getEditorMeshes(scene);
    setMeshFlag(box, "hidden", true);
    setMeshFlag(sphere, "locked", true);
    const text = stringifySceneFile(serializeScene(scene));
    clearEditorMeshes(scene);

    loadSceneFile(scene, parseSceneFile(text));
    const [loadedBox, loadedSphere] = getEditorMeshes(scene);
    expect(getMeshFlag(loadedBox, "hidden")).toBe(true);
    expect(getMeshFlag(loadedBox, "locked")).toBe(false);
    expect(getMeshFlag(loadedSphere, "hidden")).toBe(false);
    expect(getMeshFlag(loadedSphere, "locked")).toBe(true);
  });

  test("발광색·불투명도·조명 무시와 씬 설정이 그대로 돌아온다", () => {
    const glass = {
      ...gold,
      emissive: "#FF8800",
      alpha: 0.35,
      unlit: true,
    };
    addPresetMesh(scene, findPreset("box")!, glass);
    const settings = {
      background: "#204060",
      environmentIntensity: 0.4,
      exposure: 1.5,
      toneMapping: "aces",
    } as const;
    applySceneSettings(scene, settings);
    const text = stringifySceneFile(serializeScene(scene));
    clearEditorMeshes(scene);
    applySceneSettings(scene, DEFAULT_SCENE_SETTINGS);

    loadSceneFile(scene, parseSceneFile(text));
    expect(getMaterialValues(getEditorMeshes(scene)[0])).toEqual(glass);
    expect(getSceneSettings(scene)).toEqual(settings);
    expect(scene.imageProcessingConfiguration.toneMappingEnabled).toBe(true);
  });

  test("모양 값이 그대로 돌아온다 (빠진 키는 기본값)", () => {
    const torus = addPresetMesh(scene, findPreset("torus")!, gold, undefined, {
      thickness: 0.1,
      tessellation: 12,
    });
    const text = stringifySceneFile(serializeScene(scene));
    expect(text).toContain('"thickness": 0.1');
    const vertices = torus.getTotalVertices();
    clearEditorMeshes(scene);
    loadSceneFile(scene, parseSceneFile(text));
    const [loaded] = getEditorMeshes(scene);
    expect(getShapeParams(loaded)).toEqual({
      thickness: 0.1,
      tessellation: 12,
    });
    expect(loaded.getTotalVertices()).toBe(vertices);

    const partial = parseSceneFile(
      file([{ ...validMesh, presetId: "torus", shape: { thickness: 0.2 } }]),
    );
    expect(partial.meshes[0].shape).toEqual({
      thickness: 0.2,
      tessellation: 48,
    });
  });

  test("연 뒤 새로 만드는 메쉬는 파일 속 번호 다음부터", () => {
    loadSceneFile(
      scene,
      parseSceneFile(file([{ ...validMesh, name: "Box 7" }])),
    );
    expect(addPresetMesh(scene, findPreset("box")!).name).toBe("Box 8");
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
      ...MATERIAL_DEFAULTS,
      color: "#FF0000",
    });
    expect(parsed.meshes[1].material).toBeNull();
  });
});

describe("v2 파일 변환", () => {
  test("hidden·locked가 없으면 보이고 풀린 상태로 연다", () => {
    const parsed = parseSceneFile(file([validMesh], 2));
    expect(parsed.version).toBe(SCENE_FILE_VERSION);
    expect(parsed.meshes[0]).toMatchObject({ hidden: false, locked: false });

    loadSceneFile(scene, parsed);
    const [box] = getEditorMeshes(scene);
    expect(box.isVisible).toBe(true);
    expect(getMeshFlag(box, "locked")).toBe(false);
  });
});

describe("v3 파일 변환", () => {
  test("settings가 없으면 기본 설정, 머티리얼은 발광 없음·불투명·조명 받음", () => {
    const { material, ...rest } = validMesh;
    const v3Material = {
      color: material.color,
      metallic: material.metallic,
      roughness: material.roughness,
    };
    const parsed = parseSceneFile(
      file(
        [{ ...rest, material: v3Material, hidden: false, locked: false }],
        3,
      ),
    );
    expect(parsed.version).toBe(SCENE_FILE_VERSION);
    expect(parsed.settings).toEqual(DEFAULT_SCENE_SETTINGS);
    expect(parsed.meshes[0].material).toEqual({
      ...MATERIAL_DEFAULTS,
      ...v3Material,
    });
  });

  test("다른 설정에서 v3 파일을 열면 기본 설정으로 돌아간다", () => {
    applySceneSettings(scene, {
      ...DEFAULT_SCENE_SETTINGS,
      exposure: 2,
      toneMapping: "neutral",
    });
    loadSceneFile(scene, parseSceneFile(file([validMesh], 3)));
    expect(getSceneSettings(scene)).toEqual(DEFAULT_SCENE_SETTINGS);
    expect(scene.imageProcessingConfiguration.toneMappingEnabled).toBe(false);
  });
});

describe("v4 파일 변환", () => {
  test("shape가 없으면 기본 모양으로 연다", () => {
    const parsed = parseSceneFile(
      file([{ ...validMesh, presetId: "cone", name: "Cone 1" }], 4),
    );
    expect(parsed.version).toBe(SCENE_FILE_VERSION);
    expect(parsed.meshes[0].shape).toEqual({
      diameterTop: 0,
      diameterBottom: 1,
      tessellation: 24,
    });
  });
});

describe("잘못된 파일은 SceneFileError (씬을 바꾸기 전에 거른다)", () => {
  test.each([
    ["JSON이 아님", "{not json", "JSON 형식이 아닙니다"],
    ["다른 형식", JSON.stringify({ format: "other" }), "씬 파일이 아닙니다"],
    ["더 새로운 버전", file([], SCENE_FILE_VERSION + 1), "더 새로운 버전"],
    ["버전 0", file([], 0), "version"],
    ["음수 버전", file([], -1), "version"],
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
    ["숨김 값", file([{ ...validMesh, hidden: "yes" }]), "hidden"],
    [
      "프리셋에 없는 모양 값",
      file([{ ...validMesh, shape: { segments: 8 } }]),
      "shape.segments",
    ],
    [
      "모양 값 범위",
      file([{ ...validMesh, presetId: "sphere", shape: { segments: 2 } }]),
      "shape.segments",
    ],
    [
      "정수가 아닌 분할",
      file([{ ...validMesh, presetId: "sphere", shape: { segments: 8.5 } }]),
      "정수",
    ],
    [
      "불투명도 범위",
      file([{ ...validMesh, material: { ...gold, alpha: 1.5 } }]),
      "alpha",
    ],
    [
      "발광색 형식",
      file([{ ...validMesh, material: { ...gold, emissive: "orange" } }]),
      "emissive",
    ],
    [
      "조명 무시 값",
      file([{ ...validMesh, material: { ...gold, unlit: 1 } }]),
      "unlit",
    ],
    [
      "모르는 톤 매핑",
      JSON.stringify({
        format: SCENE_FILE_FORMAT,
        version: SCENE_FILE_VERSION,
        settings: { toneMapping: "filmic" },
        meshes: [],
      }),
      "toneMapping",
    ],
    [
      "음수 노출",
      JSON.stringify({
        format: SCENE_FILE_FORMAT,
        version: SCENE_FILE_VERSION,
        settings: { exposure: -1 },
        meshes: [],
      }),
      "exposure",
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
