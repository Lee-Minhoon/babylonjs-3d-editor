import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { describe, expect, test } from "vitest";

import { mergeModelParts } from "./model-template";
import { createTestScene } from "./test-scene";

const scene = createTestScene();

describe("mergeModelParts (가져온 모델을 메쉬 하나로)", () => {
  test("노드 계층을 월드 자세로 굽고, 재질마다 서브메쉬", () => {
    // glTF 로더처럼: 오른손 → 왼손 변환 루트(Z 배율 -1) 아래에 부분들
    const root = new TransformNode("__root__", scene);
    root.scaling.set(1, 1, -1);
    const red = new PBRMaterial("red", scene);
    const blue = new PBRMaterial("blue", scene);
    const box = CreateBox("box", { size: 1 }, scene);
    box.parent = root;
    box.position.set(0, 0.5, 2);
    box.material = red;
    const ball = CreateSphere("ball", { diameter: 1 }, scene);
    ball.parent = root;
    ball.position.set(3, 0.5, 0);
    ball.material = blue;
    // UV가 없는 부분도 합친다 (빈 값 채우기)
    ball.removeVerticesData("uv");
    root.computeWorldMatrix(true);

    const merged = mergeModelParts(scene, "chair", [box, ball]);

    expect(merged.getTotalVertices()).toBe(
      box.getTotalVertices() + ball.getTotalVertices(),
    );
    expect(merged.material).toBeInstanceOf(MultiMaterial);
    const subMaterials = (merged.material as MultiMaterial).subMaterials;
    expect(subMaterials[0]).toBe(red);
    expect(subMaterials[1]).toBe(blue);
    expect(merged.subMeshes.map((sub) => sub.materialIndex)).toEqual([0, 1]);
    const { minimumWorld, maximumWorld } = merged.getBoundingInfo().boundingBox;
    // 상자는 z = -2 (루트의 Z 반전), 공은 x = 3
    expect(minimumWorld.z).toBeCloseTo(-2.5);
    expect(maximumWorld.x).toBeCloseTo(3.5);
    expect(minimumWorld.y).toBeCloseTo(0);
    // 원본 부분은 그대로
    expect(box.isDisposed()).toBe(false);
  });

  test("재질이 하나면 MultiMaterial 없이 그 재질", () => {
    const material = new PBRMaterial("one", scene);
    const parts = [0, 2].map((x) => {
      const part = CreateBox(`part ${x}`, { size: 1 }, scene);
      part.position.x = x;
      part.material = material;
      return part;
    });
    const merged = mergeModelParts(scene, "pair", parts);
    expect(merged.material).toBe(material);
    expect(merged.subMeshes).toHaveLength(1);
  });

  test("정점이 있는 메쉬가 없으면 오류", () => {
    expect(() =>
      mergeModelParts(scene, "empty", [
        new TransformNode("node", scene),
      ] as never),
    ).toThrow("메쉬가 없습니다");
  });
});
