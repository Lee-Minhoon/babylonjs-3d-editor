"use client";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BabylonCanvas } from "@/components/babylon-canvas";
import { attachInspectorToggle } from "@/lib/babylon/inspector";

import {
  bindHistoryShortcuts,
  createHistory,
  type History,
} from "../lib/history";
import { createPlacementTool, type PlacementTool } from "../lib/placement-tool";

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
  camera.upperRadiusLimit = 50;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

  new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);

  const ground = CreateGround("ground", { width: 10, height: 10 }, scene);
  const groundMaterial = new StandardMaterial("ground Material", scene);
  groundMaterial.diffuseColor = new Color3(0.22, 0.22, 0.25);
  groundMaterial.specularColor = Color3.Black();
  ground.material = groundMaterial;
}

/** 뷰포트가 만들어 에디터 UI에 넘겨주는 씬과 씬에 붙은 도구들 */
export type EditorRuntime = {
  scene: Scene;
  history: History;
  placement: PlacementTool;
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
        const unbindHistoryShortcuts = bindHistoryShortcuts(history);
        const placement = createPlacementTool(scene, history);
        onRuntimeChange({ scene, history, placement });

        return () => {
          onRuntimeChange(null);
          placement.dispose();
          unbindHistoryShortcuts();
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
