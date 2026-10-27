"use client";

import {
  ChevronDown,
  type LucideIcon,
  Magnet,
  MousePointer2,
  Move3d,
  Rotate3d,
  Scale3d,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useActiveTool, useSnap } from "../hooks/use-editor-state";
import { getToolShortcut } from "../lib/editor-shortcuts";
import { SNAP_STEPS, type TransformTool } from "../lib/tools";
import type { EditorRuntime } from "./editor-viewport";

export const TOOL_ITEMS: {
  id: TransformTool;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "select", label: "선택", icon: MousePointer2 },
  { id: "move", label: "이동", icon: Move3d },
  { id: "rotate", label: "회전", icon: Rotate3d },
  { id: "scale", label: "크기", icon: Scale3d },
];

const PRESSED_CLASS =
  "size-7 data-pressed:bg-primary data-pressed:text-primary-foreground";

type TransformToolbarProps = {
  runtime: EditorRuntime;
};

/** 뷰포트 위에 띄우는 도구 바: 변형 도구(Q/W/E/R) + 스냅 토글·단위 */
export function TransformToolbar({ runtime }: TransformToolbarProps) {
  const { tools } = runtime;
  const active = useActiveTool(runtime);
  const snap = useSnap(runtime);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background/80 p-1 shadow-sm backdrop-blur">
      <ToggleGroup
        value={[active]}
        // 같은 버튼을 다시 눌러 전부 꺼지는 경우(빈 배열)는 무시 — 항상 하나는 켜져 있다
        onValueChange={([next]) => next && tools.setTool(next as TransformTool)}
        spacing={1}
        aria-label="변형 도구"
      >
        {TOOL_ITEMS.map(({ id, label, icon: Icon }) => (
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
              <Kbd>{getToolShortcut(id)}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              pressed={snap.enabled}
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
          스냅 {snap.enabled ? "켜짐" : "꺼짐"}
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-0.5 px-1.5 tabular-nums"
                    aria-label="스냅 단위"
                    disabled={!snap.enabled}
                  />
                }
              />
            }
          >
            {snap.step}
            <ChevronDown className="size-3 opacity-60" aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">스냅 단위</TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="min-w-32">
          <DropdownMenuGroup>
            <DropdownMenuLabel>스냅 단위</DropdownMenuLabel>
            <SnapStepRadioItems runtime={runtime} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 스냅 단위 라디오 항목 (툴바 드롭다운용) */
function SnapStepRadioItems({ runtime }: { runtime: EditorRuntime }) {
  const { step } = useSnap(runtime);
  return (
    <DropdownMenuRadioGroup
      value={step}
      onValueChange={(value: number) => runtime.tools.setSnapStep(value)}
    >
      {SNAP_STEPS.map((value) => (
        <DropdownMenuRadioItem key={value} value={value} closeOnClick>
          {value} 유닛
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
