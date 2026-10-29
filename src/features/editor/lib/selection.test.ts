import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, test, vi } from "vitest";

import { addPresetMesh, findPreset } from "./mesh-presets";
import { createSelection } from "./selection";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const box = () => addPresetMesh(scene, findPreset("box")!, Vector3.Zero());

describe("selection", () => {
  test("select는 하나만, toggle은 넣고 빼기 (고른 순서 유지)", () => {
    const selection = createSelection(scene);
    const [a, b, c] = [box(), box(), box()];

    selection.select(a);
    selection.toggle(b);
    selection.toggle(c);
    expect(selection.getMeshes()).toEqual([a, b, c]);

    selection.toggle(c);
    expect(selection.getMeshes()).toEqual([a, b]);

    selection.select(c);
    expect(selection.getMeshes()).toEqual([c]);
    selection.select(null);
    expect(selection.getMeshes()).toEqual([]);
    selection.dispose();
  });

  test("씬에서 빠진 메쉬는 선택에서도 빠진다", () => {
    const selection = createSelection(scene);
    const [a, b] = [box(), box()];
    selection.set([a, b]);
    scene.removeMesh(a);
    expect(selection.getMeshes()).toEqual([b]);
    selection.dispose();
  });

  test("같은 선택이면 알리지 않고 같은 배열을 돌려준다 (useSyncExternalStore)", () => {
    const selection = createSelection(scene);
    const [a, b] = [box(), box()];
    selection.set([a, b]);
    const meshes = selection.getMeshes();
    const listener = vi.fn();
    selection.subscribe(listener);

    selection.set([a, b]);
    selection.set([a, b, a]); // 중복은 한 번만
    expect(listener).not.toHaveBeenCalled();
    expect(selection.getMeshes()).toBe(meshes);
    selection.dispose();
  });
});
