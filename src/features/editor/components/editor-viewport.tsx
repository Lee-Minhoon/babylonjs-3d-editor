"use client";

import { useState } from "react";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import { BabylonCanvas } from "@/components/babylon-canvas";
import { toast } from "@/components/ui/toast";
import { attachInspectorToggle } from "@/lib/babylon/inspector";

import {
  type Autosave,
  createAutosave,
  createBrowserAutosaveStorage,
} from "../lib/autosave";
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
  // PBR 반사·간접광용 환경 (스카이박스로 보여주진 않음). 금속은 이게 없으면 검게 보인다.
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
    "/environments/studio.env",
    scene,
  );

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
  autosave: Autosave;
};

type EditorViewportProps = {
  /** 씬이 준비되면 런타임, 정리되면 null로 호출된다. */
  onRuntimeChange: (runtime: EditorRuntime | null) => void;
};

export function EditorViewport({ onRuntimeChange }: EditorViewportProps) {
  /** 엔진을 만들지 못한 이유. 콘솔에만 남기면 빈 화면에 비활성 메뉴만 보여서 여기 띄운다 */
  const [engineError, setEngineError] = useState<string | null>(null);

  return (
    <>
      {engineError && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6 text-center text-sm"
        >
          <div className="max-w-sm space-y-2">
            <p className="font-medium">3D 엔진을 시작하지 못했습니다</p>
            <p className="text-muted-foreground">
              이 브라우저에서 WebGPU와 WebGL을 모두 쓸 수 없습니다. 다른
              브라우저로 열거나 그래픽 가속 설정을 확인하세요.
            </p>
            <p className="font-mono text-xs break-all text-muted-foreground">
              {engineError}
            </p>
          </div>
        </div>
      )}
      <BabylonCanvas
        onEngineError={(error) =>
          setEngineError(error instanceof Error ? error.message : String(error))
        }
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
          const autosave = createAutosave({
            sceneFile,
            storage: createBrowserAutosaveStorage(),
            onError: (title, description) =>
              toast.add({ type: "error", title, description }),
          });
          // 탭이 숨겨지면(닫기·전환) 기다리던 자동 저장을 바로 남긴다
          const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") void autosave.flush();
          };
          document.addEventListener("visibilitychange", onVisibilityChange);
          const unbindShortcuts = bindEditorShortcuts({
            history,
            placement,
            selection,
            tools,
            clipboard,
            sceneFile,
            gizmo,
          });
          onRuntimeChange({
            scene,
            history,
            placement,
            selection,
            tools,
            clipboard,
            sceneFile,
            autosave,
          });

          return () => {
            onRuntimeChange(null);
            unbindShortcuts();
            // 내용은 동기로 읽어 두므로 씬이 해제되기 전에 남길 수 있다
            void autosave.flush();
            autosave.dispose();
            document.removeEventListener(
              "visibilitychange",
              onVisibilityChange,
            );
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
    </>
  );
}
