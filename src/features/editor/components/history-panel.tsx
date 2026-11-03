"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { useHistoryState } from "../hooks/use-editor-state";
import type { EditorRuntime } from "./editor-viewport";

/** 목록 맨 위 항목 (기록이 하나도 적용되지 않은 지점) */
export const HISTORY_START_LABEL = "시작";

/**
 * 히스토리 패널 (속성 패널 아래): undo 기록을 오래된 것부터 보여주고, 항목을 누르면 그 시점으로 한 번에 이동한다.
 * 되돌린 항목(redo 가능)은 흐리게 보인다. 새 편집을 하면 그 뒤의 흐린 항목은 사라진다 (redo 스택과 같음).
 */
export function HistoryPanel({ runtime }: { runtime: EditorRuntime | null }) {
  const { entries, position } = useHistoryState(runtime);
  const [open, setOpen] = useState(true);
  const current = useRef<HTMLButtonElement>(null);

  // 지금 위치가 보이게 (기록이 쌓이거나 undo/redo로 움직일 때)
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [position, entries, open]);

  const items = [HISTORY_START_LABEL, ...entries];

  return (
    <section
      aria-label="히스토리"
      className="flex shrink-0 flex-col border-t border-sidebar-border"
    >
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        className="h-9 justify-start gap-1.5 rounded-none px-3 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown aria-hidden className="size-3.5" />
        ) : (
          <ChevronRight aria-hidden className="size-3.5" />
        )}
        기록
        <span className="font-normal tabular-nums">({entries.length})</span>
      </Button>
      {open && (
        <ScrollArea className="h-40">
          <ol className="px-1.5 pb-1.5">
            {items.map((label, index) => (
              <li key={index}>
                <Button
                  ref={index === position ? current : undefined}
                  variant="ghost"
                  size="sm"
                  aria-current={index === position ? "step" : undefined}
                  className={cn(
                    "h-6 w-full justify-start truncate px-1.5 text-xs font-normal",
                    index === position && "bg-sidebar-accent font-medium",
                    index > position && "text-muted-foreground opacity-60",
                  )}
                  onClick={() => runtime?.history.goTo(index)}
                >
                  {label}
                </Button>
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}
    </section>
  );
}
