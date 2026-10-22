"use client";

import type { ComponentProps } from "react";

import {
  type SceneReadyHandler,
  useBabylonScene,
} from "@/hooks/useBabylonScene";
import type { CreateEngineOptions } from "@/lib/babylon/engine";

type BabylonCanvasProps = Omit<ComponentProps<"canvas">, "ref"> & {
  onSceneReady: SceneReadyHandler;
  engineOptions?: CreateEngineOptions;
};

export function BabylonCanvas({
  onSceneReady,
  engineOptions,
  className,
  ...props
}: BabylonCanvasProps) {
  const canvasRef = useBabylonScene(onSceneReady, engineOptions);

  return (
    <canvas
      ref={canvasRef}
      className={`block size-full touch-none outline-none ${className ?? ""}`}
      {...props}
    />
  );
}
