"use client";

import { useSyncExternalStore } from "react";

import {
  type LucideIcon,
  Magnet,
  MousePointer2,
  Move3d,
  Rotate3d,
  Scale3d,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  POSITION_SNAP,
  type ToolState,
  type TransformTool,
} from "../lib/tools";

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

const PRESSED_CLASS =
  "size-7 data-pressed:bg-primary data-pressed:text-primary-foreground";

type TransformToolbarProps = {
  tools: ToolState;
};

/** 뷰포트 위에 띄우는 도구 바: 변형 도구(Q/W/E/R) + 스냅 토글 */
export function TransformToolbar({ tools }: TransformToolbarProps) {
  const active = useSyncExternalStore(
    tools.subscribe,
    tools.getTool,
    tools.getTool,
  );
  const snap = useSyncExternalStore(
    tools.subscribe,
    tools.isSnapEnabled,
    tools.isSnapEnabled,
  );

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background/80 p-1 shadow-sm backdrop-blur">
      <ToggleGroup
        value={[active]}
        // 같은 버튼을 다시 눌러 전부 꺼지는 경우(빈 배열)는 무시 — 항상 하나는 켜져 있다
        onValueChange={([next]) => next && tools.setTool(next as TransformTool)}
        spacing={1}
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
                  className={PRESSED_CLASS}
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

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              pressed={snap}
              onPressedChange={tools.setSnapEnabled}
              size="sm"
              aria-label="스냅"
              className={PRESSED_CLASS}
            />
          }
        >
          <Magnet aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          스냅 {snap ? "켜짐" : "꺼짐"} ({POSITION_SNAP} 단위)
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
