import { describe, expect, test, vi } from "vitest";

import {
  applyMaterialValues,
  createMaterialCommand,
  getMaterialValues,
  isSameMaterial,
  onMaterialChange,
} from "./mesh-material";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const gold = { color: "#D4AF37", metallic: 1, roughness: 0.15 };

function createBox() {
  return addPresetMesh(scene, findPreset("box")!, {
    color: "#FF0000",
    metallic: 0,
    roughness: 0.5,
  });
}

describe("mesh material", () => {
  test("적용한 값을 그대로 돌려준다 (선형↔sRGB 변환 오차 없음)", () => {
    const mesh = createBox();
    applyMaterialValues(mesh, gold);
    expect(getMaterialValues(mesh)).toEqual(gold);
  });

  test("값이 바뀌면 그 메쉬의 구독자만 알림을 받는다", () => {
    const mesh = createBox();
    const other = createBox();
    const listener = vi.fn();
    const unsubscribe = onMaterialChange(mesh, listener);

    applyMaterialValues(other, gold);
    expect(listener).not.toHaveBeenCalled();
    applyMaterialValues(mesh, gold);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    applyMaterialValues(mesh, { ...gold, roughness: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("Command undo/redo", () => {
    const mesh = createBox();
    const before = getMaterialValues(mesh)!;
    const command = createMaterialCommand(mesh, before, gold);
    expect(command.label).toBe(`${mesh.name} 머티리얼`);
    command.execute();
    expect(getMaterialValues(mesh)).toEqual(gold);
    command.undo();
    expect(getMaterialValues(mesh)).toEqual(before);
  });

  test("색 비교는 대소문자를 무시한다", () => {
    expect(isSameMaterial(gold, { ...gold, color: "#d4af37" })).toBe(true);
    expect(isSameMaterial(gold, { ...gold, metallic: 0.9 })).toBe(false);
  });
});
