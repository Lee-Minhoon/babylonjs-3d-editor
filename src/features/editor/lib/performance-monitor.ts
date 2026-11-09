import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import { isEditorMesh } from "./mesh-presets";

/*
 * 성능 표시 (보기 메뉴): FPS·프레임 시간·그리기 호출 수·객체 수·그려진 삼각형 수.
 * 켜져 있을 때만 잰다 — 0.5초마다 한 번 읽어 상태를 바꾼다 (매 프레임 바꾸면 패널이 프레임마다 다시 그려진다).
 * 그리기 호출 수는 Babylon SceneInstrumentation (켤 때 만들고 끌 때 해제).
 */

export type PerformanceStats = {
  fps: number;
  /** 1000 / fps (ms) */
  frameMs: number;
  /** 마지막 프레임의 그리기 호출 수 (기즈모·격자·선택 외곽선 포함) */
  drawCalls: number;
  /** 에디터 객체 수 (메쉬·조명·모델) */
  objects: number;
  /** 화면 안에 들어와 그려진 삼각형 수 */
  triangles: number;
};

export type PerformanceState = {
  visible: boolean;
  /** 켠 직후 첫 측정 전이면 null */
  stats: PerformanceStats | null;
};

export type PerformanceMonitor = {
  setVisible(visible: boolean): void;
  getState(): PerformanceState;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

export const PERFORMANCE_SAMPLE_INTERVAL = 500;

export function createPerformanceMonitor(scene: Scene): PerformanceMonitor {
  let state: PerformanceState = { visible: false, stats: null };
  let instrumentation: SceneInstrumentation | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = createListeners();

  const sample = () => {
    const fps = scene.getEngine().getFps();
    state = {
      visible: true,
      stats: {
        fps: Math.round(fps),
        frameMs: fps > 0 ? Math.round(10000 / fps) / 10 : 0,
        drawCalls: instrumentation?.drawCallsCounter.current ?? 0,
        objects: scene.meshes.filter(isEditorMesh).length,
        triangles: Math.round(scene.getActiveIndices() / 3),
      },
    };
    listeners.emit();
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    instrumentation?.dispose();
    instrumentation = null;
  };

  return {
    setVisible(visible) {
      if (visible === state.visible) return;
      stop();
      if (visible) {
        instrumentation = new SceneInstrumentation(scene);
        timer = setInterval(sample, PERFORMANCE_SAMPLE_INTERVAL);
      }
      state = { visible, stats: null };
      listeners.emit();
    },
    getState: () => state,
    subscribe: listeners.subscribe,
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
