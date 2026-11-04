"use client";

import {
  Box,
  ChevronDown,
  Globe,
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

import {
  useActiveTool,
  useGizmoSpace,
  useSnap,
} from "../hooks/use-editor-state";
import { TOOL_LABELS } from "../lib/editor-reference";
import type { EditorRuntime } from "../lib/editor-runtime";
import { getToolShortcut } from "../lib/editor-shortcuts";
import {
  formatSnapStep,
  type GizmoSpace,
  SNAP_STEPS,
  type SnapKind,
  snapKindForTool,
  type TransformTool,
} from "../lib/tools";

export const TOOL_ITEMS: {
  id: TransformTool;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "select", label: TOOL_LABELS.select, icon: MousePointer2 },
  { id: "move", label: TOOL_LABELS.move, icon: Move3d },
  { id: "rotate", label: TOOL_LABELS.rotate, icon: Rotate3d },
  { id: "scale", label: TOOL_LABELS.scale, icon: Scale3d },
];

export const GIZMO_SPACE_LABELS: Record<GizmoSpace, string> = {
  local: "로컬 축",
  world: "월드 축",
};

const SNAP_KIND_LABELS: Record<SnapKind, string> = {
  move: "이동",
  rotate: "회전",
  scale: "크기",
};

const PRESSED_CLASS =
  "size-7 data-pressed:bg-primary data-pressed:text-primary-foreground";

type TransformToolbarProps = {
  runtime: EditorRuntime;
};

/**
 * 뷰포트 위에 띄우는 도구 바: 변형 도구(Q/W/E/R) · 기즈모 축(로컬/월드) · 스냅 토글·단위.
 * 스냅 단위 드롭다운은 지금 도구의 종류(이동·회전·크기)를 보여준다 — 선택 도구는 배치용 이동 단위.
 */
export function TransformToolbar({ runtime }: TransformToolbarProps) {
  const { tools } = runtime;
  const active = useActiveTool(runtime);
  const snapKind = snapKindForTool(active);
  const snap = useSnap(runtime, snapKind);
  const space = useGizmoSpace(runtime);
  const SpaceIcon = space === "local" ? Box : Globe;

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
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={`기즈모 축: ${GIZMO_SPACE_LABELS[space]}`}
              onClick={() =>
                tools.setGizmoSpace(space === "local" ? "world" : "local")
              }
            />
          }
        >
          <SpaceIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {GIZMO_SPACE_LABELS[space]} (누르면{" "}
          {GIZMO_SPACE_LABELS[space === "local" ? "world" : "local"]})
        </TooltipContent>
      </Tooltip>

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
                    aria-label={`${SNAP_KIND_LABELS[snapKind]} 스냅 단위`}
                    disabled={!snap.enabled}
                  />
                }
              />
            }
          >
            {formatSnapStep(snapKind, snap.step)}
            <ChevronDown className="size-3 opacity-60" aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {SNAP_KIND_LABELS[snapKind]} 스냅 단위
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="min-w-32">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {SNAP_KIND_LABELS[snapKind]} 스냅 단위
            </DropdownMenuLabel>
            <SnapStepRadioItems runtime={runtime} kind={snapKind} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 스냅 단위 라디오 항목 (툴바 드롭다운용) */
function SnapStepRadioItems({
  runtime,
  kind,
}: {
  runtime: EditorRuntime;
  kind: SnapKind;
}) {
  const { step } = useSnap(runtime, kind);
  return (
    <DropdownMenuRadioGroup
      value={step}
      onValueChange={(value: number) => runtime.tools.setSnapStep(kind, value)}
    >
      {SNAP_STEPS[kind].map((value) => (
        <DropdownMenuRadioItem key={value} value={value} closeOnClick>
          {formatSnapStep(kind, value)}
          {kind === "move" && " 유닛"}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
