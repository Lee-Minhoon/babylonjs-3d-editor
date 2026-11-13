import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { describe, expect, test } from "vitest";

import { createHistory } from "./history";
import { findPreset, inCreationOrder } from "./mesh-presets";
import { createPlacementTool } from "./placement-tool";
import { createTestScene } from "./test-scene";
import { createToolState } from "./tools";

/** 위에서 거의 수직으로 내려다보는 카메라: 화면 가운데 광선이 상자 윗면을 맞는다 */
function setup() {
  const scene = createTestScene();
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 4,
    0.2,
    10,
    Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;
  CreateGround("ground", { width: 100, height: 100 }, scene);
  const history = createHistory();
  const tools = createToolState();
  const placement = createPlacementTool(scene, history, tools);
  const engine = scene.getEngine();
  scene.pointerX = engine.getRenderWidth() / 2;
  scene.pointerY = engine.getRenderHeight() / 2;
  const preview = () =>
    scene.meshes.find((mesh) => mesh.name === "__placement-preview")!;
  return { scene, tools, placement, preview };
}

describe("프리셋 배치", () => {
  test("X/Z는 이동 스냅 단위에 맞추고 Y는 표면 높이 그대로", () => {
    const { scene, tools, placement } = setup();
    scene.pointerX += 7; // 격자에서 살짝 비껴난 자리
    tools.setSnapStep("move", 1);
    placement.toggle(findPreset("box")!);
    placement.place();
    const [snapped] = inCreationOrder(scene.meshes);
    expect(snapped.position.x).toBe(Math.round(snapped.position.x));
    expect(snapped.position.z).toBe(Math.round(snapped.position.z));
    expect(snapped.position.y).toBeCloseTo(0.5);

    tools.setSnapEnabled(false);
    placement.updatePointer();
    placement.place();
    const [, free] = inCreationOrder(scene.meshes);
    expect(free.position.x).not.toBe(Math.round(free.position.x));
  });

  test("조명 프리셋은 표면 위로 lift만큼 띄운다", () => {
    const { scene, placement } = setup();
    const preset = findPreset("point-light")!;
    placement.toggle(preset);
    placement.place();
    const [light] = inCreationOrder(scene.meshes);
    // 아이콘 밑면이 표면(y=0)에서 lift만큼 위
    light.computeWorldMatrix(true);
    light.refreshBoundingInfo({});
    expect(light.getBoundingInfo().boundingBox.minimumWorld.y).toBeCloseTo(
      preset.lift!,
    );
  });

  test("놓은 직후 미리보기가 그 메쉬 위로 올라가고, 같은 자리에 다시 놓으면 쌓인다", () => {
    const { scene, placement, preview } = setup();
    placement.toggle(findPreset("box")!);
    scene.render();
    placement.place();
    // 새 메쉬의 월드 행렬이 만들 때(원점) 값으로 캐시돼 있으면 광선이 못 맞춰 미리보기가 상자 안에 남는다
    expect(preview().position.y).toBeCloseTo(1.5);

    placement.place();
    const [first, second] = inCreationOrder(scene.meshes);
    expect(first.position.y).toBeCloseTo(0.5);
    expect(second.position.y).toBeCloseTo(1.5);
  });
});
