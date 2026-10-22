"use client";

// 메시에 머티리얼을 지정하지 않았을 때 쓰이는 기본 머티리얼 등록
import "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import { useEffect, useEffectEvent, useRef } from "react";

import { createEngine, type CreateEngineOptions } from "@/lib/babylon/engine";
import { ensureLoadersRegistered } from "@/lib/babylon/loaders";

export type SceneReadyHandler = (scene: Scene) => void | (() => void);

/**
 * 캔버스 ref에 엔진/씬을 붙이고, 렌더 루프·리사이즈·정리를 관리한다.
 * 엔진 생성은 비동기(WebGPU 초기화)이므로 onSceneReady는 엔진 준비 후 호출된다.
 * onSceneReady가 함수를 반환하면 씬 dispose 직전에 호출된다.
 */
export function useBabylonScene(
  onSceneReady: SceneReadyHandler,
  engineOptions?: CreateEngineOptions,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleSceneReady = useEffectEvent(onSceneReady);
  const antialias = engineOptions?.antialias;
  const preserveDrawingBuffer = engineOptions?.preserveDrawingBuffer;
  const preferWebGPU = engineOptions?.preferWebGPU;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    ensureLoadersRegistered();

    createEngine(canvas, { antialias, preserveDrawingBuffer, preferWebGPU })
      .then((engine) => {
        if (cancelled) {
          engine.dispose();
          return;
        }

        const scene = new Scene(engine);
        const cleanup = handleSceneReady(scene);

        engine.runRenderLoop(() => scene.render());

        const resizeObserver = new ResizeObserver(() => engine.resize());
        resizeObserver.observe(canvas);

        teardown = () => {
          resizeObserver.disconnect();
          cleanup?.();
          scene.dispose();
          engine.dispose();
        };
      })
      .catch((error) => {
        console.error("[babylon] 엔진 생성 실패", error);
      });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [antialias, preserveDrawingBuffer, preferWebGPU]);

  return canvasRef;
}
