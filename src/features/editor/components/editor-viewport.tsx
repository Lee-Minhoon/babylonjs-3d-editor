"use client";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial";

import { BabylonCanvas } from "@/components/babylon-canvas";
import { attachInspectorToggle } from "@/lib/babylon/inspector";

import { bindEditorShortcuts } from "../lib/editor-shortcuts";
import { createHistory, type History } from "../lib/history";
import { createPlacementTool, type PlacementTool } from "../lib/placement-tool";
import { bindPointerRouter } from "../lib/pointer-router";
import { createSelection, type Selection } from "../lib/selection";
import { createToolState, type ToolState } from "../lib/tools";
import { createTransformGizmo } from "../lib/transform-gizmo";

function setupScene(scene: Scene) {
  scene.clearColor = new Color4(0.1, 0.1, 0.12, 1);

  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 4,
    Math.PI / 3,
    10,
    Vector3.Zero(),
    scene,
  );
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 120;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

  new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);

  // 바닥: 100×100, 1유닛 격자 + 10유닛마다 굵은 선
  const ground = CreateGround("ground", { width: 100, height: 100 }, scene);
  const grid = new GridMaterial("ground Material", scene);
  grid.mainColor = new Color3(0.13, 0.13, 0.15);
  grid.lineColor = new Color3(0.42, 0.42, 0.48);
  grid.gridRatio = 1;
  grid.majorUnitFrequency = 10;
  grid.minorUnitVisibility = 0.35;
  grid.backFaceCulling = false;
  ground.material = grid;
}

/** 뷰포트가 만들어 에디터 UI에 넘겨주는 씬과 씬에 붙은 도구들 */
export type EditorRuntime = {
  scene: Scene;
  history: History;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
};

type EditorViewportProps = {
  /** 씬이 준비되면 런타임, 정리되면 null로 호출된다. */
  onRuntimeChange: (runtime: EditorRuntime | null) => void;
};

export function EditorViewport({ onRuntimeChange }: EditorViewportProps) {
  return (
    <BabylonCanvas
      onSceneReady={(scene) => {
        setupScene(scene);
        const detachInspector = attachInspectorToggle(scene);
        const history = createHistory();
        const tools = createToolState();
        const placement = createPlacementTool(scene, history, tools);
        const selection = createSelection(scene);
        const gizmo = createTransformGizmo(scene, {
          history,
          selection,
          tools,
          placement,
        });
        const unbindPointer = bindPointerRouter(scene, {
          gizmo,
          placement,
          selection,
        });
        const unbindShortcuts = bindEditorShortcuts({
          history,
          placement,
          selection,
          tools,
        });
        onRuntimeChange({ scene, history, placement, selection, tools });

        return () => {
          onRuntimeChange(null);
          unbindShortcuts();
          unbindPointer();
          gizmo.dispose();
          selection.dispose();
          placement.dispose();
          // undo로 씬에서 떼어둔 메쉬는 scene.dispose()가 모르므로 여기서 해제
          history.dispose();
          detachInspector();
        };
      }}
      // 우클릭은 배치 취소에 쓰므로 브라우저 컨텍스트 메뉴를 막는다
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
