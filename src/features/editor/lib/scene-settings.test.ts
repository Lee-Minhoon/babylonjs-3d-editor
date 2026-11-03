import { describe, expect, test, vi } from "vitest";

import {
  applySceneSettings,
  createSceneSettingsCommand,
  DEFAULT_SCENE_SETTINGS,
  getSceneSettings,
  isSameSceneSettings,
  onSceneSettingsChange,
  type SceneSettings,
} from "./scene-settings";
import { createTestScene } from "./test-scene";

const bright: SceneSettings = {
  background: "#FFFFFF",
  environmentIntensity: 2,
  exposure: 0.5,
  toneMapping: "standard",
};

describe("씬 설정", () => {
  test("Babylon 씬에 적용하고, 적용한 값을 그대로 돌려준다", () => {
    const scene = createTestScene();
    applySceneSettings(scene, bright);
    expect(getSceneSettings(scene)).toEqual(bright);
    expect(scene.clearColor.asArray()).toEqual([1, 1, 1, 1]);
    expect(scene.environmentIntensity).toBe(2);
    expect(scene.imageProcessingConfiguration.exposure).toBe(0.5);
    expect(scene.imageProcessingConfiguration.toneMappingEnabled).toBe(true);

    applySceneSettings(scene, DEFAULT_SCENE_SETTINGS);
    expect(scene.imageProcessingConfiguration.toneMappingEnabled).toBe(false);
    scene.dispose();
  });

  test("Command undo/redo와 변경 알림", () => {
    const scene = createTestScene();
    applySceneSettings(scene, DEFAULT_SCENE_SETTINGS);
    const listener = vi.fn();
    const unsubscribe = onSceneSettingsChange(listener);
    const command = createSceneSettingsCommand(
      scene,
      DEFAULT_SCENE_SETTINGS,
      bright,
    );
    expect(command.label).toBe("씬 설정");
    command.execute();
    expect(getSceneSettings(scene)).toEqual(bright);
    command.undo();
    expect(getSceneSettings(scene)).toEqual(DEFAULT_SCENE_SETTINGS);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    scene.dispose();
  });

  test("색 비교는 대소문자를 무시한다", () => {
    expect(
      isSameSceneSettings(bright, { ...bright, background: "#ffffff" }),
    ).toBe(true);
    expect(
      isSameSceneSettings(bright, { ...bright, toneMapping: "aces" }),
    ).toBe(false);
  });
});
