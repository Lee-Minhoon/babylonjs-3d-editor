import { describe, expect, test, vi } from "vitest";

import { setMeshFlag } from "./mesh-flags";
import { addPresetMesh, findPreset, inCreationOrder } from "./mesh-presets";
import { createSelection } from "./selection";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const box = () => addPresetMesh(scene, findPreset("box")!);

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

  test("선택한 메쉬가 여럿 빠지면 바로 빠지고, 알림은 한 번에 모아서 한다", async () => {
    const own = createTestScene();
    const selection = createSelection(own);
    const meshes = [0, 1, 2].map(() => addPresetMesh(own, findPreset("box")!));
    selection.set(meshes);
    const listener = vi.fn();
    selection.subscribe(listener);
    own.removeMesh(meshes[0]);
    own.removeMesh(meshes[2]);
    expect(selection.getMeshes()).toEqual([meshes[1]]);
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(selection.getMeshes()).toEqual([meshes[1]]);
    selection.dispose();
    own.dispose();
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

  test("selectAll은 에디터 메쉬 전부를 만든 순서로", () => {
    const selection = createSelection(scene);
    const [a, b] = [box(), box()];
    selection.select(b);
    selection.selectAll();
    const selected = selection.getMeshes();
    expect(selected).toEqual(inCreationOrder(scene.meshes));
    expect(selected.indexOf(a)).toBeLessThan(selected.indexOf(b));
  });

  test("숨긴 메쉬는 선택에서 빠지고 다시 고를 수 없다", () => {
    const own = createTestScene();
    const selection = createSelection(own);
    const [a, b] = [0, 1].map(() => addPresetMesh(own, findPreset("box")!));
    selection.set([a, b]);
    setMeshFlag(a, "hidden", true);
    expect(selection.getMeshes()).toEqual([b]);

    selection.select(a);
    expect(selection.getMeshes()).toEqual([]);
    setMeshFlag(a, "hidden", false);
    selection.select(a);
    expect(selection.getMeshes()).toEqual([a]);
    selection.dispose();
    own.dispose();
  });

  test("잠근 메쉬는 직접 고를 순 있지만 selectAll에서는 빠진다", () => {
    const own = createTestScene();
    const selection = createSelection(own);
    const [a, b, c] = [0, 1, 2].map(() =>
      addPresetMesh(own, findPreset("box")!),
    );
    setMeshFlag(b, "locked", true);
    setMeshFlag(c, "hidden", true);
    selection.selectAll();
    expect(selection.getMeshes()).toEqual([a]);
    selection.select(b);
    expect(selection.getMeshes()).toEqual([b]);
    selection.dispose();
    own.dispose();
  });
});
