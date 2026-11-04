import { describe, expect, test, vi } from "vitest";

import {
  createEditableProperty,
  createMeshProperty,
} from "./editable-property";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { createTestScene } from "./test-scene";

/** 테스트용 대상: 값을 들고 있거나(없으면 속성이 없는 대상) */
type Target = { name: string; value: { n: number } | null };

const counter = createEditableProperty<Target, { n: number }>({
  verb: "값",
  label: (target) => `${target.name} 값`,
  read: (target) => target.value && { ...target.value },
  write: (target, values) => {
    target.value = { ...values };
  },
  isSame: (a, b) => a.n === b.n,
});

describe("createEditableProperty", () => {
  test("get은 복사본, apply는 쓰고 알린다", () => {
    const target: Target = { name: "A", value: { n: 1 } };
    const listener = vi.fn();
    const unsubscribe = counter.onChange(target, listener);

    const read = counter.get(target)!;
    read.n = 99;
    expect(target.value).toEqual({ n: 1 });

    counter.apply(target, { n: 2 });
    expect(target.value).toEqual({ n: 2 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    counter.apply(target, { n: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("속성이 없는 대상에는 쓰지도 알리지도 않는다", () => {
    const target: Target = { name: "B", value: null };
    const listener = vi.fn();
    counter.onChange(target, listener);
    counter.apply(target, { n: 1 });
    expect(target.value).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  test("다른 대상의 변경은 알리지 않는다", () => {
    const a: Target = { name: "A", value: { n: 0 } };
    const b: Target = { name: "B", value: { n: 0 } };
    const listener = vi.fn();
    counter.onChange(a, listener);
    counter.apply(b, { n: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  test("Command: 라벨, execute/undo", () => {
    const target: Target = { name: "A", value: { n: 1 } };
    const command = counter.createCommand(target, { n: 1 }, { n: 5 });
    expect(command.label).toBe("A 값");
    command.execute();
    expect(target.value).toEqual({ n: 5 });
    command.undo();
    expect(target.value).toEqual({ n: 1 });
  });
});

describe("createMeshProperty", () => {
  test("라벨은 메쉬 이름 + 동사", () => {
    const scene = createTestScene();
    const mesh = addPresetMesh(scene, findPreset("box")!);
    const property = createMeshProperty<{ n: number }>({
      verb: "테스트",
      read: () => ({ n: 0 }),
      write: () => {},
      isSame: () => true,
    });
    expect(property.createCommand(mesh, { n: 0 }, { n: 1 }).label).toBe(
      `${mesh.name} 테스트`,
    );
    scene.dispose();
  });
});
