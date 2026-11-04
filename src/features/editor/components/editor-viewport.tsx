"use client";

import { useState } from "react";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import { BabylonCanvas } from "@/components/babylon-canvas";
import { toast } from "@/components/ui/toast";
import { attachInspectorToggle } from "@/lib/babylon/inspector";

import { createBrowserAutosaveStorage } from "../lib/autosave";
import { createEditorRuntime, type EditorRuntime } from "../lib/editor-runtime";
import { bindEditorShortcuts } from "../lib/editor-shortcuts";
import { createGroundGrid } from "../lib/ground-grid";
import {
  AMBIENT_LIGHT_NAME,
  applySceneSettings,
  DEFAULT_SCENE_SETTINGS,
} from "../lib/scene-settings";

function setupScene(scene: Scene): ArcRotateCamera {
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

  // 씬 전체를 밝히는 기본 조명 (세기는 씬 설정). 직접 놓는 조명은 editor-lights
  new HemisphericLight(AMBIENT_LIGHT_NAME, new Vector3(0.3, 1, 0.2), scene);
  // 기본 조명을 만든 뒤에 (세기도 설정이 정한다)
  applySceneSettings(scene, DEFAULT_SCENE_SETTINGS);
  // PBR 반사·간접광용 환경 (스카이박스로 보여주진 않음). 금속은 이게 없으면 검게 보인다.
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
    "/environments/studio.env",
    scene,
  );

  createGroundGrid(scene);
  return camera;
}

type EditorViewportProps = {
  /** 씬이 준비되면 런타임, 정리되면 null로 호출된다. */
  onRuntimeChange: (runtime: EditorRuntime | null) => void;
};

/**
 * 뷰포트: 씬을 꾸미고(카메라·기본 조명·격자) 도구들을 만들어(editor-runtime) UI에 넘긴다.
 * 브라우저에 붙는 것(키보드 단축키·탭 숨김 때 자동 저장·인스펙터·컨텍스트 메뉴)만 여기서 배선한다.
 */
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
          const camera = setupScene(scene);
          const detachInspector = attachInspectorToggle(scene);
          const { runtime, dispose } = createEditorRuntime(scene, camera, {
            notify: (notice) => toast.add(notice),
            autosaveStorage: createBrowserAutosaveStorage(),
          });
          // 탭이 숨겨지면(닫기·전환) 기다리던 자동 저장을 바로 남긴다
          const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
              void runtime.autosave.flush();
            }
          };
          document.addEventListener("visibilitychange", onVisibilityChange);
          const unbindShortcuts = bindEditorShortcuts(runtime);
          onRuntimeChange(runtime);

          return () => {
            onRuntimeChange(null);
            unbindShortcuts();
            document.removeEventListener(
              "visibilitychange",
              onVisibilityChange,
            );
            dispose();
            detachInspector();
          };
        }}
        // 우클릭은 배치 취소에 쓰므로 브라우저 컨텍스트 메뉴를 막는다
        onContextMenu={(event) => event.preventDefault()}
      />
    </>
  );
}
