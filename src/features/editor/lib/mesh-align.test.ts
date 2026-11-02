import { afterEach, describe, expect, test } from "vitest";

import { createHistory } from "./history";
import {
  createAlignCommand,
  createDistributeCommand,
  createDropToFloorCommand,
} from "./mesh-align";
import { setMeshFlag } from "./mesh-flags";
import { addPresetMesh, findPreset } from "./mesh-presets";
import { clearEditorMeshes } from "./scene-format";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
afterEach(() => clearEditorMeshes(scene));

/** 1×1×1 박스 (가운데 x, y, z) */
function box(x: number, y: number, z = 0) {
  const mesh = addPresetMesh(scene, findPreset("box")!);
  mesh.position.set(x, y, z);
  mesh.computeWorldMatrix(true);
  return mesh;
}

const bottom = (mesh: ReturnType<typeof box>) => {
  mesh.computeWorldMatrix(true);
  return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
};

describe("바닥에 붙이기", () => {
  test("떠 있거나 묻힌 메쉬를 바닥(y=0)에 붙이고, undo로 되돌린다", () => {
    const history = createHistory();
    const [floating, buried] = [box(0, 3), box(5, -0.2)];
    history.execute(createDropToFloorCommand([floating, buried])!);
    expect(bottom(floating)).toBeCloseTo(0);
    expect(bottom(buried)).toBeCloseTo(0);
    history.undo();
    expect(floating.position.y).toBeCloseTo(3);
    expect(buried.position.y).toBeCloseTo(-0.2);
  });

  test("아래에 다른 메쉬가 있으면 그 윗면에 놓는다 (숨긴 메쉬는 건너뛰고, 잠근 메쉬는 표면)", () => {
    const base = box(0, 0.5);
    const hidden = box(3, 0.5);
    setMeshFlag(hidden, "hidden", true);
    setMeshFlag(base, "locked", true);
    const [onBase, onHidden] = [box(0, 4), box(3, 4)];
    createDropToFloorCommand([onBase, onHidden])!.execute();
    expect(bottom(onBase)).toBeCloseTo(1);
    expect(bottom(onHidden)).toBeCloseTo(0);
  });

  test("함께 고른 메쉬끼리는 아래 것부터 붙여서 쌓인다", () => {
    const [upper, lower] = [box(0, 6), box(0, 3)];
    createDropToFloorCommand([upper, lower])!.execute();
    expect(bottom(lower)).toBeCloseTo(0);
    expect(bottom(upper)).toBeCloseTo(1);
  });

  test("이미 붙어 있으면 Command를 만들지 않는다", () => {
    expect(createDropToFloorCommand([box(0, 0.5)])).toBeNull();
  });
});

describe("정렬·분배", () => {
  test("X 최소·최대·가운데는 선택 전체의 바운딩 박스 기준", () => {
    const [a, b] = [box(0, 0.5), box(4, 2.5)];
    createAlignCommand([a, b], "x", "min")!.execute();
    expect([a.position.x, b.position.x]).toEqual([0, 0]);

    b.position.x = 4;
    createAlignCommand([a, b], "y", "max")!.execute();
    expect(a.position.y).toBeCloseTo(2.5);

    const center = createAlignCommand([a, b], "x", "center")!;
    expect(center.label).toBe("메쉬 2개 정렬");
    center.execute();
    expect([a.position.x, b.position.x]).toEqual([2, 2]);
    expect(createAlignCommand([a], "x", "min")).toBeNull();
  });

  test("분배는 양 끝을 두고 사이를 같은 간격으로 (고른 순서와 무관)", () => {
    const [end, middle, start, near] = [
      box(9, 0.5),
      box(1, 0.5),
      box(0, 0.5),
      box(2, 0.5),
    ];
    const history = createHistory();
    history.execute(createDistributeCommand([end, middle, start, near], "x")!);
    expect([start, middle, near, end].map((m) => m.position.x)).toEqual([
      0, 3, 6, 9,
    ]);
    history.undo();
    expect(middle.position.x).toBe(1);
    expect(createDistributeCommand([end, middle], "x")).toBeNull();
  });
});
