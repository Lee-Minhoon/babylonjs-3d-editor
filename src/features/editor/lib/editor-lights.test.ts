import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test, vi } from "vitest";

import { captureMeshSnapshot, createMeshFromSnapshot } from "./clipboard";
import {
  addLightObject,
  applyLightValues,
  createLightCommand,
  getBabylonLight,
  getLightKind,
  getLightValues,
  LIGHT_DEFAULTS,
  onLightChange,
} from "./editor-lights";
import { createHistory } from "./history";
import { createRemoveMeshCommand } from "./mesh-commands";
import { setMeshFlag } from "./mesh-flags";
import { addPresetMesh, findPreset, isLightObject } from "./mesh-presets";
import { getExportMeshes } from "./scene-export";
import {
  clearEditorMeshes,
  getEditorMeshes,
  loadSceneFile,
  parseSceneFile,
  SCENE_FILE_FORMAT,
  serializeScene,
  stringifySceneFile,
} from "./scene-format";
import {
  AMBIENT_LIGHT_NAME,
  applySceneSettings,
  DEFAULT_SCENE_SETTINGS,
} from "./scene-settings";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const spotPreset = findPreset("spot-light")!;

describe("조명 객체", () => {
  test("아이콘 메쉬 + 자식 Babylon 조명, 에디터 객체로 이름이 붙는다", () => {
    const spot = addLightObject(scene, spotPreset);
    expect(spot.name).toMatch(/^Spot Light \d+$/);
    expect(isLightObject(spot)).toBe(true);
    expect(getLightKind(spot)).toBe("spot");
    const light = getBabylonLight(spot)!;
    expect(light).toBeInstanceOf(SpotLight);
    expect(light.parent).toBe(spot);
    expect(getLightValues(spot)).toEqual(LIGHT_DEFAULTS.spot);
    expect(isLightObject(addPresetMesh(scene, findPreset("box")!))).toBe(false);
  });

  test("값 적용: 색은 선형으로, 각도는 라디안으로, 알림", () => {
    const spot = addLightObject(scene, spotPreset);
    const listener = vi.fn();
    onLightChange(spot, listener);
    applyLightValues(spot, {
      ...LIGHT_DEFAULTS.spot,
      color: "#FF0000",
      intensity: 5,
      angle: 90,
    });
    const light = getBabylonLight(spot) as SpotLight;
    expect(light.diffuse.asArray()).toEqual([1, 0, 0]);
    expect(light.intensity).toBe(5);
    expect(light.angle).toBeCloseTo(Math.PI / 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("삭제하면 조명도 씬에서 빠지고, undo하면 돌아온다", () => {
    const point = addLightObject(scene, findPreset("point-light")!);
    const light = getBabylonLight(point)!;
    const history = createHistory();
    history.execute(createRemoveMeshCommand(scene, point));
    expect(scene.lights).not.toContain(light);
    history.undo();
    expect(scene.lights).toContain(light);
  });

  test("숨기면 조명이 꺼진다", () => {
    const point = addLightObject(scene, findPreset("point-light")!);
    setMeshFlag(point, "hidden", true);
    expect(getBabylonLight(point)!.isEnabled()).toBe(false);
    setMeshFlag(point, "hidden", false);
    expect(getBabylonLight(point)!.isEnabled()).toBe(true);
  });

  test("해제한 조명은 숨김 알림을 더 받지 않는다 (구독이 남아 메모리에 붙잡히지 않게)", () => {
    const point = addLightObject(scene, findPreset("point-light")!);
    const light = getBabylonLight(point)!;
    const setEnabled = vi.spyOn(light, "setEnabled");
    point.dispose(false, true);
    setMeshFlag(point, "hidden", true);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  test("그림자를 켜면 생성기가 생기고, 끄면 없어진다", () => {
    const sun = addLightObject(scene, findPreset("directional-light")!);
    const light = getBabylonLight(sun)!;
    applyLightValues(sun, { ...LIGHT_DEFAULTS.directional, shadows: true });
    expect(light.getShadowGenerator()).not.toBeNull();
    applyLightValues(sun, LIGHT_DEFAULTS.directional);
    expect(light.getShadowGenerator()).toBeNull();
  });

  test("Command undo/redo", () => {
    const spot = addLightObject(scene, spotPreset);
    const before = getLightValues(spot)!;
    const after = { ...before, intensity: 42 };
    const command = createLightCommand(spot, before, after);
    expect(command.label).toBe(`${spot.name} 조명`);
    command.execute();
    expect(getLightValues(spot)).toEqual(after);
    command.undo();
    expect(getLightValues(spot)).toEqual(before);
  });

  test("복사본은 조명 값을 따라간다", () => {
    const spot = addLightObject(scene, spotPreset, {
      ...LIGHT_DEFAULTS.spot,
      color: "#00FF00",
    });
    const copy = createMeshFromSnapshot(
      scene,
      captureMeshSnapshot(spot)!,
      Vector3.Zero(),
    );
    expect(getLightValues(copy)?.color).toBe("#00FF00");
    expect(getBabylonLight(copy)).not.toBe(getBabylonLight(spot));
  });

  test("내보내기 대상(스크린샷·glTF)에서 빠진다", () => {
    const spot = addLightObject(scene, spotPreset);
    expect(getExportMeshes(scene)).not.toContain(spot);
  });
});

describe("씬 파일의 조명", () => {
  test("종류·값·위치가 그대로 돌아온다", () => {
    clearEditorMeshes(scene);
    const spot = addLightObject(scene, spotPreset, {
      ...LIGHT_DEFAULTS.spot,
      intensity: 33,
      shadows: true,
    });
    spot.position.set(1, 3, 2);
    const text = stringifySceneFile(serializeScene(scene));
    clearEditorMeshes(scene);

    loadSceneFile(scene, parseSceneFile(text));
    const [loaded] = getEditorMeshes(scene);
    expect(getLightKind(loaded)).toBe("spot");
    expect(getLightValues(loaded)).toMatchObject({
      intensity: 33,
      shadows: true,
    });
    expect(loaded.position.asArray()).toEqual([1, 3, 2]);
    expect(scene.lights).toContain(getBabylonLight(loaded));
    clearEditorMeshes(scene);
  });

  test("빠진 조명 값은 그 종류의 기본값, 범위 밖은 오류", () => {
    const entry = {
      presetId: "point-light",
      name: "Point Light 1",
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scaling: [1, 1, 1],
      material: null,
    };
    const file = (light: unknown) =>
      JSON.stringify({
        format: SCENE_FILE_FORMAT,
        version: 6,
        meshes: [{ ...entry, light }],
      });
    expect(parseSceneFile(file({ intensity: 3 })).meshes[0].light).toEqual({
      ...LIGHT_DEFAULTS.point,
      intensity: 3,
    });
    expect(() => parseSceneFile(file({ angle: 200 }))).toThrow("light.angle");
    expect(() => parseSceneFile(file({ shadows: "yes" }))).toThrow(
      "light.shadows",
    );
  });

  test("기본 조명 세기는 씬 설정 (v5 파일은 1)", () => {
    const ambient = new HemisphericLight(
      AMBIENT_LIGHT_NAME,
      Vector3.Up(),
      scene,
    );
    applySceneSettings(scene, {
      ...DEFAULT_SCENE_SETTINGS,
      ambientIntensity: 0.2,
    });
    expect(ambient.intensity).toBe(0.2);

    const v5 = parseSceneFile(
      JSON.stringify({
        format: SCENE_FILE_FORMAT,
        version: 5,
        settings: { background: "#000000" },
        meshes: [],
      }),
    );
    expect(v5.settings.ambientIntensity).toBe(1);
    ambient.dispose();
  });
});
