"use client";

import type { ReactNode } from "react";

import { Box as BoxIcon, type LucideIcon, Redo2, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  useActivePresetId,
  useActiveTool,
  useClipboardHasContent,
  useHistoryState,
  useSelectedMesh,
  useSnap,
} from "../hooks/use-editor-state";
import {
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  paste,
} from "../lib/editor-actions";
import {
  getPresetShortcut,
  getToolShortcut,
  SHORTCUT_LABELS,
} from "../lib/editor-shortcuts";
import { MESH_PRESETS } from "../lib/mesh-presets";
import { SNAP_STEPS, type TransformTool } from "../lib/tools";
import type { EditorRuntime } from "./editor-viewport";
import { PRESET_ICONS } from "./preset-icons";
import { TOOL_ITEMS } from "./transform-toolbar";

/** 아직 기능이 없는 예약 항목 (단축키 자리는 비워두되 메뉴엔 보여준다) */
function PlannedItem({
  children,
  shortcut,
}: {
  children: ReactNode;
  shortcut?: string;
}) {
  return (
    <MenubarItem disabled>
      {children}
      <span className="text-[0.625rem] text-muted-foreground">준비 중</span>
      {shortcut && <MenubarShortcut>{shortcut}</MenubarShortcut>}
    </MenubarItem>
  );
}

function HistoryIconButton({
  icon: Icon,
  label,
  actionLabel,
  shortcut,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  actionLabel: string | null;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={!actionLabel}
            onClick={onClick}
          />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {actionLabel ? `${label}: ${actionLabel}` : label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

type EditorHeaderProps = {
  runtime: EditorRuntime | null;
};

/** 상단 헤더: 앱 이름 · 메뉴바(파일/편집/추가/보기) · 실행 취소/다시 실행 · 렌더러 표시 */
export function EditorHeader({ runtime }: EditorHeaderProps) {
  const { undoLabel, redoLabel } = useHistoryState(runtime);
  const selected = useSelectedMesh(runtime);
  const activePresetId = useActivePresetId(runtime);
  const activeTool = useActiveTool(runtime);
  const snap = useSnap(runtime);
  const canPaste = useClipboardHasContent(runtime);
  const isWebGPU = runtime?.scene.getEngine().isWebGPU;

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground">
      <div className="flex items-center gap-1.5 px-1.5 text-xs font-semibold">
        <BoxIcon className="size-4 text-primary" aria-hidden />
        Babylon Editor
      </div>

      <Menubar className="h-7 border-none bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger>파일</MenubarTrigger>
          <MenubarContent>
            <PlannedItem>새 씬</PlannedItem>
            <PlannedItem>열기…</PlannedItem>
            <MenubarSeparator />
            <PlannedItem shortcut={SHORTCUT_LABELS.save}>저장</PlannedItem>
            <PlannedItem>내보내기…</PlannedItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>편집</MenubarTrigger>
          <MenubarContent className="min-w-56">
            <MenubarItem
              disabled={!undoLabel}
              onClick={() => runtime?.history.undo()}
            >
              실행 취소
              {undoLabel && (
                <span className="truncate text-muted-foreground">
                  {undoLabel}
                </span>
              )}
              <MenubarShortcut>{SHORTCUT_LABELS.undo}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!redoLabel}
              onClick={() => runtime?.history.redo()}
            >
              다시 실행
              {redoLabel && (
                <span className="truncate text-muted-foreground">
                  {redoLabel}
                </span>
              )}
              <MenubarShortcut>{SHORTCUT_LABELS.redo}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!selected}
              onClick={() => runtime && cutSelected(runtime)}
            >
              잘라내기
              <MenubarShortcut>{SHORTCUT_LABELS.cut}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!selected}
              onClick={() => runtime && copySelected(runtime)}
            >
              복사
              <MenubarShortcut>{SHORTCUT_LABELS.copy}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!canPaste}
              onClick={() => runtime && paste(runtime)}
            >
              붙여넣기
              <MenubarShortcut>{SHORTCUT_LABELS.paste}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!selected}
              onClick={() => runtime && duplicateSelected(runtime)}
            >
              복제
              <MenubarShortcut>{SHORTCUT_LABELS.duplicate}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              variant="destructive"
              disabled={!selected}
              onClick={() => runtime && deleteSelected(runtime)}
            >
              삭제
              <MenubarShortcut>{SHORTCUT_LABELS.delete}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <PlannedItem shortcut={SHORTCUT_LABELS.selectAll}>
              전체 선택
            </PlannedItem>
            <MenubarItem
              disabled={!selected}
              onClick={() => runtime?.selection.select(null)}
            >
              선택 해제
              <MenubarShortcut>{SHORTCUT_LABELS.deselect}</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>추가</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarLabel>메쉬</MenubarLabel>
              {MESH_PRESETS.map((preset) => {
                const Icon = PRESET_ICONS[preset.id];
                return (
                  <MenubarItem
                    key={preset.id}
                    disabled={!runtime}
                    onClick={() => {
                      // 메뉴에서 고르면 항상 그 프리셋 배치 시작 (이미 켜져 있으면 유지)
                      if (activePresetId !== preset.id)
                        runtime?.placement.toggle(preset);
                    }}
                  >
                    <Icon strokeWidth={1.75} aria-hidden />
                    {preset.label}
                    <MenubarShortcut>
                      {getPresetShortcut(preset.id)}
                    </MenubarShortcut>
                  </MenubarItem>
                );
              })}
            </MenubarGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>보기</MenubarTrigger>
          <MenubarContent className="min-w-48">
            <MenubarGroup>
              <MenubarLabel>도구</MenubarLabel>
              <MenubarRadioGroup
                value={activeTool}
                onValueChange={(tool: TransformTool) =>
                  runtime?.tools.setTool(tool)
                }
              >
                {TOOL_ITEMS.map(({ id, label, icon: Icon }) => (
                  <MenubarRadioItem
                    key={id}
                    value={id}
                    disabled={!runtime}
                    closeOnClick
                  >
                    <Icon aria-hidden />
                    {label}
                    <MenubarShortcut>{getToolShortcut(id)}</MenubarShortcut>
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem
              closeOnClick
              checked={snap.enabled}
              disabled={!runtime}
              onCheckedChange={(checked) =>
                runtime?.tools.setSnapEnabled(checked)
              }
            >
              스냅
            </MenubarCheckboxItem>
            <MenubarSub>
              <MenubarSubTrigger disabled={!runtime || !snap.enabled}>
                스냅 단위
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {snap.step}
                </span>
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarRadioGroup
                  value={snap.step}
                  onValueChange={(step: number) =>
                    runtime?.tools.setSnapStep(step)
                  }
                >
                  {SNAP_STEPS.map((step) => (
                    <MenubarRadioItem key={step} value={step} closeOnClick>
                      {step} 유닛
                    </MenubarRadioItem>
                  ))}
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <PlannedItem shortcut={SHORTCUT_LABELS.focus}>
              선택 항목으로 이동
            </PlannedItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="mx-1 h-4 w-px bg-sidebar-border" aria-hidden />

      <div className="flex items-center gap-0.5">
        <HistoryIconButton
          icon={Undo2}
          label="실행 취소"
          actionLabel={undoLabel}
          shortcut={SHORTCUT_LABELS.undo}
          onClick={() => runtime?.history.undo()}
        />
        <HistoryIconButton
          icon={Redo2}
          label="다시 실행"
          actionLabel={redoLabel}
          shortcut={SHORTCUT_LABELS.redo}
          onClick={() => runtime?.history.redo()}
        />
      </div>

      {runtime && (
        <Badge variant="outline" className="ml-auto font-mono">
          {isWebGPU ? "WebGPU" : "WebGL"}
        </Badge>
      )}
    </header>
  );
}
