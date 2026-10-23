"use client";

import { useState } from "react";

import { type EditorRuntime, EditorViewport } from "./editor-viewport";
import { MeshSidebar } from "./mesh-sidebar";

/** 에디터 레이아웃. 씬과 도구는 뷰포트가 만들고, 사이드바는 그것을 조작한다. */
export function Editor() {
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);

  return (
    <div className="flex h-dvh w-full bg-zinc-950">
      <MeshSidebar runtime={runtime} />
      <div className="relative min-w-0 flex-1">
        <EditorViewport onRuntimeChange={setRuntime} />
      </div>
    </div>
  );
}
