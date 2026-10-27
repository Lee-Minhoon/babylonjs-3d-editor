"use client";

import { useState } from "react";

import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

import { DiscardChangesDialog } from "./discard-changes-dialog";
import { EditorHeader } from "./editor-header";
import { type EditorRuntime, EditorViewport } from "./editor-viewport";
import { MeshSidebar } from "./mesh-sidebar";
import { PropertiesPanel } from "./properties-panel";
import { TransformToolbar } from "./transform-toolbar";

/**
 * 에디터 레이아웃:
 *   [헤더(메뉴바)]
 *   [메쉬 사이드바] [뷰포트 + 도구 바] [속성 패널]
 * 씬과 도구는 뷰포트가 만들고, 나머지 UI는 그것을 조작한다.
 */
export function Editor() {
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);

  return (
    <Toaster>
      <TooltipProvider>
        <div className="flex h-dvh w-full flex-col bg-background text-foreground">
          <EditorHeader runtime={runtime} />
          <div className="flex min-h-0 flex-1">
            <MeshSidebar runtime={runtime} />
            <div className="relative min-w-0 flex-1">
              <EditorViewport onRuntimeChange={setRuntime} />
              {runtime && (
                <div className="absolute top-3 left-3">
                  <TransformToolbar runtime={runtime} />
                </div>
              )}
            </div>
            <PropertiesPanel runtime={runtime} />
          </div>
        </div>
        <DiscardChangesDialog runtime={runtime} />
      </TooltipProvider>
    </Toaster>
  );
}
