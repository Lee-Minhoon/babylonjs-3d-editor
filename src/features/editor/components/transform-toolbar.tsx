"use client";

import { useSyncExternalStore } from "react";

import {
  type LucideIcon,
  MousePointer2,
  Move3d,
  Rotate3d,
  Scale3d,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ToolState, TransformTool } from "../lib/tools";

const TOOLS: {
  id: TransformTool;
  label: string;
  icon: LucideIcon;
  shortcut: string;
}[] = [
  { id: "select", label: "선택", icon: MousePointer2, shortcut: "Q" },
  { id: "move", label: "이동", icon: Move3d, shortcut: "W" },
  { id: "rotate", label: "회전", icon: Rotate3d, shortcut: "E" },
  { id: "scale", label: "크기", icon: Scale3d, shortcut: "R" },
];

type TransformToolbarProps = {
  tools: ToolState;
};

/** 뷰포트 위에 띄우는 도구 선택 바 (Q/W/E/R과 같은 상태를 공유) */
export function TransformToolbar({ tools }: TransformToolbarProps) {
  const active = useSyncExternalStore(
    tools.subscribe,
    tools.getTool,
    tools.getTool,
  );

  return (
    <ToggleGroup
      value={[active]}
      // 같은 버튼을 다시 눌러 전부 꺼지는 경우(빈 배열)는 무시 — 항상 하나는 켜져 있다
      onValueChange={([next]) => next && tools.setTool(next as TransformTool)}
      spacing={1}
      className="rounded-lg border border-border bg-background/80 p-1 shadow-sm backdrop-blur"
      aria-label="변형 도구"
    >
      {TOOLS.map(({ id, label, icon: Icon, shortcut }) => (
        <Tooltip key={id}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value={id}
                size="sm"
                aria-label={label}
                className="size-7 data-pressed:bg-primary data-pressed:text-primary-foreground"
              />
            }
          >
            <Icon aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {label}
            <Kbd>{shortcut}</Kbd>
          </TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
