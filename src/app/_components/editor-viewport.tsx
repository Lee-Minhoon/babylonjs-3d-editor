"use client";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BabylonCanvas } from "@/components/babylon-canvas";
import { attachInspectorToggle } from "@/lib/babylon/inspector";

function setupScene(scene: Scene) {
  scene.clearColor = new Color4(0.1, 0.1, 0.12, 1);

  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 4,
    Math.PI / 3,
    8,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

  new HemisphericLight("light", new Vector3(0, 1, 0), scene);

  CreateBox("box", { size: 1 }, scene).position.y = 0.5;
  CreateGround("ground", { width: 10, height: 10 }, scene);

  return attachInspectorToggle(scene);
}

export function EditorViewport() {
  return <BabylonCanvas onSceneReady={setupScene} />;
}
