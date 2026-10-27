"use client";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import { BabylonCanvas } from "@/components/babylon-canvas";
import { toast } from "@/components/ui/toast";
import { attachInspectorToggle } from "@/lib/babylon/inspector";

import { type Clipboard, createClipboard } from "../lib/clipboard";
import { bindEditorShortcuts } from "../lib/editor-shortcuts";
import { createGroundGrid } from "../lib/ground-grid";
import { createHistory, type History } from "../lib/history";
import { createPlacementTool, type PlacementTool } from "../lib/placement-tool";
import { bindPointerRouter } from "../lib/pointer-router";
import { createSceneFile, type SceneFile } from "../lib/scene-file";
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

  createGroundGrid(scene);
}

/** 뷰포트가 만들어 에디터 UI에 넘겨주는 씬과 씬에 붙은 도구들 */
export type EditorRuntime = {
  scene: Scene;
  history: History;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
  clipboard: Clipboard;
  sceneFile: SceneFile;
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
        const clipboard = createClipboard();
        const sceneFile = createSceneFile(scene, {
          history,
          selection,
          placement,
          notify: (notice) => toast.add(notice),
        });
        const unbindShortcuts = bindEditorShortcuts({
          history,
          placement,
          selection,
          tools,
          clipboard,
          sceneFile,
        });
        onRuntimeChange({
          scene,
          history,
          placement,
          selection,
          tools,
          clipboard,
          sceneFile,
        });

        return () => {
          onRuntimeChange(null);
          unbindShortcuts();
          sceneFile.dispose();
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
