import { describe, expect, test, vi } from "vitest";

import { createHistory } from "./history";
import {
  createMeshFlagCommand,
  getMeshFlag,
  isPickableInViewport,
  onMeshFlagChange,
  setMeshFlag,
} from "./mesh-flags";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const box = () => addPresetMesh(scene, findPreset("box")!);

describe("mesh-flags", () => {
  test("숨김은 isVisible, 잠금은 따로 — 바뀔 때만 알린다", () => {
    const mesh = box();
    const listener = vi.fn();
    const unsubscribe = onMeshFlagChange(mesh, listener);

    setMeshFlag(mesh, "hidden", true);
    expect(mesh.isVisible).toBe(false);
    expect(getMeshFlag(mesh, "hidden")).toBe(true);
    setMeshFlag(mesh, "hidden", true);
    expect(listener).toHaveBeenCalledTimes(1);

    setMeshFlag(mesh, "locked", true);
    expect(getMeshFlag(mesh, "locked")).toBe(true);
    expect(mesh.isPickable).toBe(true); // 배치 표면으로는 계속 맞는다
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  test("뷰포트에서 고를 수 있는 건 숨기지도 잠그지도 않은 에디터 메쉬", () => {
    const [shown, hidden, locked] = [box(), box(), box()];
    setMeshFlag(hidden, "hidden", true);
    setMeshFlag(locked, "locked", true);
    expect(isPickableInViewport(shown)).toBe(true);
    expect(isPickableInViewport(hidden)).toBe(false);
    expect(isPickableInViewport(locked)).toBe(false);
  });

  test("Command는 바뀌는 메쉬만 묶고 undo 한 번에 되돌린다", () => {
    const history = createHistory();
    const [a, b, c] = [box(), box(), box()];
    setMeshFlag(c, "hidden", true);

    const command = createMeshFlagCommand([a, b, c], "hidden", true)!;
    expect(command.label).toBe("메쉬 2개 숨기기");
    history.execute(command);
    expect([a, b, c].map((m) => m.isVisible)).toEqual([false, false, false]);
    history.undo();
    expect([a, b, c].map((m) => m.isVisible)).toEqual([true, true, false]);

    expect(createMeshFlagCommand([c], "hidden", true)).toBeNull();
    expect(createMeshFlagCommand([c], "hidden", false)!.label).toBe(
      `${c.name} 보이기`,
    );
    expect(createMeshFlagCommand([a], "locked", true)!.label).toBe(
      `${a.name} 잠금`,
    );
  });
});
