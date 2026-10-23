"use client";

import { useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { type EditorRuntime, EditorViewport } from "./editor-viewport";
import { MeshSidebar } from "./mesh-sidebar";
import { PropertiesPanel } from "./properties-panel";
import { TransformToolbar } from "./transform-toolbar";

/**
 * 에디터 레이아웃: [메쉬 사이드바] [뷰포트] [속성 패널].
 * 씬과 도구는 뷰포트가 만들고, 양쪽 패널은 그것을 조작한다.
 */
export function Editor() {
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);

  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full bg-background text-foreground">
        <MeshSidebar runtime={runtime} />
        <div className="relative min-w-0 flex-1">
          <EditorViewport onRuntimeChange={setRuntime} />
          {runtime && (
            <div className="absolute top-3 left-3">
              <TransformToolbar tools={runtime.tools} />
            </div>
          )}
        </div>
        <PropertiesPanel runtime={runtime} />
      </div>
    </TooltipProvider>
  );
}
