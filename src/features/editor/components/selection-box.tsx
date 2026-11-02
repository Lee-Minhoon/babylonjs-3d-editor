"use client";

import { useBoxSelectRect } from "../hooks/use-editor-state";
import type { EditorRuntime } from "./editor-viewport";

/** 박스 선택 중인 사각형 (뷰포트 위에 겹쳐 그린다, 포인터 입력은 캔버스로 통과) */
export function SelectionBox({ runtime }: { runtime: EditorRuntime | null }) {
  const rect = useBoxSelectRect(runtime);
  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute border border-primary bg-primary/10"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }}
    />
  );
}
