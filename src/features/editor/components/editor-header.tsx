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
import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import {
  useActivePresetId,
  useActiveTool,
  useClipboardHasContent,
  useGizmoSpace,
  useHistoryState,
  useSceneFileState,
  useSelection,
  useSnap,
} from "../hooks/use-editor-state";
import { useMeshFlagCount } from "../hooks/use-mesh-flags";
import {
  alignSelected,
  copySelected,
  cutSelected,
  deleteSelected,
  distributeSelected,
  dropSelectedToFloor,
  duplicateSelected,
  focusSelected,
  hideSelected,
  paste,
  setSelectedLocked,
  showAllHidden,
  startRename,
} from "../lib/editor-actions";
import {
  getPresetShortcut,
  getToolShortcut,
  SHORTCUT_LABELS,
} from "../lib/editor-shortcuts";
import type { AlignAxis, AlignEdge } from "../lib/mesh-align";
import { inCreationOrder, MESH_PRESETS } from "../lib/mesh-presets";
import {
  formatSnapStep,
  type GizmoSpace,
  SNAP_STEPS,
  type SnapKind,
  type TransformTool,
} from "../lib/tools";
import type { EditorRuntime } from "./editor-viewport";
import { PRESET_ICONS } from "./preset-icons";
import { GIZMO_SPACE_LABELS, TOOL_ITEMS } from "./transform-toolbar";

const SNAP_MENU_LABELS: Record<SnapKind, string> = {
  move: "이동 스냅 단위",
  rotate: "회전 스냅 단위",
  scale: "크기 스냅 단위",
};

/** 보기 메뉴의 스냅 단위 하위 메뉴 (이동·회전·크기 각각) */
function SnapStepSubmenu({
  runtime,
  kind,
}: {
  runtime: EditorRuntime | null;
  kind: SnapKind;
}) {
  const snap = useSnap(runtime, kind);
  return (
    <MenubarSub>
      <MenubarSubTrigger disabled={!runtime || !snap.enabled}>
        {SNAP_MENU_LABELS[kind]}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {formatSnapStep(kind, snap.step)}
        </span>
      </MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={snap.step}
          onValueChange={(step: number) =>
            runtime?.tools.setSnapStep(kind, step)
          }
        >
          {SNAP_STEPS[kind].map((step) => (
            <MenubarRadioItem key={step} value={step} closeOnClick>
              {formatSnapStep(kind, step)}
            </MenubarRadioItem>
          ))}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}

const ALIGN_AXES: readonly AlignAxis[] = ["x", "y", "z"];
const ALIGN_EDGES: readonly { edge: AlignEdge; label: string }[] = [
  { edge: "min", label: "최소" },
  { edge: "center", label: "가운데" },
  { edge: "max", label: "최대" },
];

/**
 * 객체 메뉴: 숨기기·잠금 · 바닥에 붙이기 · 정렬(2개 이상) · 분배(3개 이상).
 * 정렬 기준은 선택 전체의 바운딩 박스 (mesh-align)
 */
function ObjectMenu({ runtime }: { runtime: EditorRuntime | null }) {
  const selected = useSelection(runtime);
  const sceneMeshes = inCreationOrder(useSceneMeshes(runtime?.scene ?? null));
  const hiddenCount = useMeshFlagCount(sceneMeshes, "hidden");
  const lockedCount = useMeshFlagCount(selected, "locked");
  const count = selected.length;

  return (
    <MenubarMenu>
      <MenubarTrigger>객체</MenubarTrigger>
      <MenubarContent className="min-w-52">
        <MenubarItem
          disabled={count === 0}
          onClick={() => runtime && hideSelected(runtime)}
        >
          숨기기
          <MenubarShortcut>{SHORTCUT_LABELS.hide}</MenubarShortcut>
        </MenubarItem>
        <MenubarItem
          disabled={hiddenCount === 0}
          onClick={() => runtime && showAllHidden(runtime)}
        >
          숨긴 메쉬 모두 보이기
          <MenubarShortcut>{SHORTCUT_LABELS.showAll}</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          disabled={lockedCount === count}
          onClick={() => runtime && setSelectedLocked(runtime, true)}
        >
          잠그기
        </MenubarItem>
        <MenubarItem
          disabled={lockedCount === 0}
          onClick={() => runtime && setSelectedLocked(runtime, false)}
        >
          잠금 풀기
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          disabled={count === 0}
          onClick={() => runtime && dropSelectedToFloor(runtime)}
        >
          바닥에 붙이기
          <MenubarShortcut>{SHORTCUT_LABELS.dropToFloor}</MenubarShortcut>
        </MenubarItem>
        <MenubarSub>
          <MenubarSubTrigger disabled={count < 2}>정렬</MenubarSubTrigger>
          <MenubarSubContent>
            {ALIGN_AXES.map((axis, index) => (
              <MenubarGroup key={axis}>
                {index > 0 && <MenubarSeparator />}
                {ALIGN_EDGES.map(({ edge, label }) => (
                  <MenubarItem
                    key={edge}
                    onClick={() =>
                      runtime && alignSelected(runtime, axis, edge)
                    }
                  >
                    {axis.toUpperCase()} {label}
                  </MenubarItem>
                ))}
              </MenubarGroup>
            ))}
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSub>
          <MenubarSubTrigger disabled={count < 3}>
            같은 간격으로 분배
          </MenubarSubTrigger>
          <MenubarSubContent>
            {ALIGN_AXES.map((axis) => (
              <MenubarItem
                key={axis}
                onClick={() => runtime && distributeSelected(runtime, axis)}
              >
                {axis.toUpperCase()}축
              </MenubarItem>
            ))}
          </MenubarSubContent>
        </MenubarSub>
      </MenubarContent>
    </MenubarMenu>
  );
}

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

/** 상단 헤더: 앱 이름 · 메뉴바(파일/편집/추가/객체/보기) · 실행 취소/다시 실행 · 파일 이름 · 렌더러 표시 */
export function EditorHeader({ runtime }: EditorHeaderProps) {
  const { undoLabel, redoLabel } = useHistoryState(runtime);
  const selectionCount = useSelection(runtime).length;
  const hasSelection = selectionCount > 0;
  const activePresetId = useActivePresetId(runtime);
  const activeTool = useActiveTool(runtime);
  const snapEnabled = useSnap(runtime, "move").enabled;
  const gizmoSpace = useGizmoSpace(runtime);
  const canPaste = useClipboardHasContent(runtime);
  const file = useSceneFileState(runtime);
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
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.newScene()}
            >
              새 씬
            </MenubarItem>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.open()}
            >
              열기…
              <MenubarShortcut>{SHORTCUT_LABELS.open}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.save()}
            >
              저장
              <MenubarShortcut>{SHORTCUT_LABELS.save}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.saveAs()}
            >
              다른 이름으로 저장…
              <MenubarShortcut>{SHORTCUT_LABELS.saveAs}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <PlannedItem>glTF로 내보내기…</PlannedItem>
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
              disabled={!hasSelection}
              onClick={() => runtime && cutSelected(runtime)}
            >
              잘라내기
              <MenubarShortcut>{SHORTCUT_LABELS.cut}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!hasSelection}
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
              disabled={!hasSelection}
              onClick={() => runtime && duplicateSelected(runtime)}
            >
              복제
              <MenubarShortcut>{SHORTCUT_LABELS.duplicate}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={selectionCount !== 1}
              onClick={() => runtime && startRename(runtime)}
            >
              이름 바꾸기
              <MenubarShortcut>{SHORTCUT_LABELS.rename}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              variant="destructive"
              disabled={!hasSelection}
              onClick={() => runtime && deleteSelected(runtime)}
            >
              삭제
              <MenubarShortcut>{SHORTCUT_LABELS.delete}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!runtime}
              onClick={() => runtime?.selection.selectAll()}
            >
              전체 선택
              <MenubarShortcut>{SHORTCUT_LABELS.selectAll}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!hasSelection}
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

        <ObjectMenu runtime={runtime} />

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
            <MenubarGroup>
              <MenubarLabel>기즈모 축</MenubarLabel>
              <MenubarRadioGroup
                value={gizmoSpace}
                onValueChange={(space: GizmoSpace) =>
                  runtime?.tools.setGizmoSpace(space)
                }
              >
                {(["local", "world"] as const).map((space) => (
                  <MenubarRadioItem
                    key={space}
                    value={space}
                    disabled={!runtime}
                    closeOnClick
                  >
                    {GIZMO_SPACE_LABELS[space]}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem
              closeOnClick
              checked={snapEnabled}
              disabled={!runtime}
              onCheckedChange={(checked) =>
                runtime?.tools.setSnapEnabled(checked)
              }
            >
              스냅
            </MenubarCheckboxItem>
            <SnapStepSubmenu runtime={runtime} kind="move" />
            <SnapStepSubmenu runtime={runtime} kind="rotate" />
            <SnapStepSubmenu runtime={runtime} kind="scale" />
            <MenubarSeparator />
            <MenubarItem
              disabled={!hasSelection}
              onClick={() => runtime && focusSelected(runtime)}
            >
              선택 항목에 맞춰 보기
              <MenubarShortcut>{SHORTCUT_LABELS.focus}</MenubarShortcut>
            </MenubarItem>
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
        <div className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{file.fileName ?? "제목 없음"}</span>
          {file.dirty && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary"
              aria-label="저장되지 않은 변경 사항"
            />
          )}
        </div>
      )}

      {runtime && (
        <Badge variant="outline" className="font-mono">
          {isWebGPU ? "WebGPU" : "WebGL"}
        </Badge>
      )}
    </header>
  );
}
