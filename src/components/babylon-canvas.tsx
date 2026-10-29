"use client";

import type { ComponentProps } from "react";

import {
  type SceneReadyHandler,
  useBabylonScene,
} from "@/hooks/use-babylon-scene";
import type { CreateEngineOptions } from "@/lib/babylon/engine";

type BabylonCanvasProps = Omit<ComponentProps<"canvas">, "ref"> & {
  onSceneReady: SceneReadyHandler;
  engineOptions?: CreateEngineOptions;
  /** 엔진을 만들지 못했을 때 (WebGPU·WebGL 모두 불가) */
  onEngineError?: (error: unknown) => void;
};

export function BabylonCanvas({
  onSceneReady,
  engineOptions,
  onEngineError,
  className,
  ...props
}: BabylonCanvasProps) {
  const canvasRef = useBabylonScene(onSceneReady, engineOptions, onEngineError);

  return (
    <canvas
      ref={canvasRef}
      className={`block size-full touch-none outline-none ${className ?? ""}`}
      {...props}
    />
  );
}
