"use client";

import { useState } from "react";

import type { Scene } from "@babylonjs/core/scene";

import { EditorViewport } from "./editor-viewport";
import { MeshSidebar } from "./mesh-sidebar";

/** 에디터 레이아웃. 씬은 뷰포트가 만들고, 사이드바는 그 씬을 조작한다. */
export function Editor() {
  const [scene, setScene] = useState<Scene | null>(null);

  return (
    <div className="flex h-dvh w-full bg-zinc-950">
      <MeshSidebar scene={scene} />
      <div className="relative min-w-0 flex-1">
        <EditorViewport onSceneChange={setScene} />
      </div>
    </div>
  );
}
