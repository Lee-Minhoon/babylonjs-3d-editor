"use client";

import { type ReactNode, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { type LucideIcon, Redo2, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import { getPresetShortcut } from "../lib/editor-shortcuts";
import type { History, HistoryState } from "../lib/history";
import { createRemoveMeshCommand } from "../lib/mesh-commands";
import {
  isEditorMesh,
  MESH_PRESETS,
  type MeshPresetId,
} from "../lib/mesh-presets";
import type { PlacementTool } from "../lib/placement-tool";
import type { Selection } from "../lib/selection";
import type { EditorRuntime } from "./editor-viewport";
import { MeshIcon, PRESET_ICONS } from "./preset-icons";

const subscribeNoop = () => () => {};
const getNull = () => null;
const EMPTY_HISTORY: HistoryState = { undoLabel: null, redoLabel: null };
const getEmptyHistory = () => EMPTY_HISTORY;

/** 배치 모드에서 현재 선택된 프리셋 id (배치 중이 아니면 null) */
function useActivePresetId(
  placement: PlacementTool | undefined,
): MeshPresetId | null {
  return useSyncExternalStore(
    placement?.subscribe ?? subscribeNoop,
    placement?.getActivePresetId ?? getNull,
    getNull,
  );
}

function useHistoryState(history: History | undefined): HistoryState {
  return useSyncExternalStore(
    history?.subscribe ?? subscribeNoop,
    history?.getState ?? getEmptyHistory,
    getEmptyHistory,
  );
}

function useSelectedMesh(
  selection: Selection | undefined,
): AbstractMesh | null {
  return useSyncExternalStore(
    selection?.subscribe ?? subscribeNoop,
    selection?.getSelected ?? getNull,
    getNull,
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

type HistoryButtonProps = {
  icon: LucideIcon;
  label: string;
  /** 되돌릴/다시 할 작업 이름. 없으면 비활성 */
  actionLabel: string | null;
  shortcut: string;
  onClick: () => void;
};

function HistoryButton({
  icon: Icon,
  label,
  actionLabel,
  shortcut,
  onClick,
}: HistoryButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={!actionLabel}
            onClick={onClick}
          />
        }
      >
        <Icon aria-hidden />
        {label}
      </TooltipTrigger>
      <TooltipContent>
        {actionLabel ? `${label}: ${actionLabel}` : label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

type MeshSidebarProps = {
  runtime: EditorRuntime | null;
};

export function MeshSidebar({ runtime }: MeshSidebarProps) {
  const meshes = useSceneMeshes(runtime?.scene ?? null)
    .filter(isEditorMesh)
    // undo로 다시 붙은 메쉬는 scene.meshes 끝에 들어가므로 생성 순서(uniqueId)로 정렬
    .toSorted((a, b) => a.uniqueId - b.uniqueId);
  const activePresetId = useActivePresetId(runtime?.placement);
  const { undoLabel, redoLabel } = useHistoryState(runtime?.history);
  const selectedMesh = useSelectedMesh(runtime?.selection);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-xs text-sidebar-foreground">
      <div className="flex gap-1.5 p-3">
        <HistoryButton
          icon={Undo2}
          label="실행 취소"
          actionLabel={undoLabel}
          shortcut="⌘Z"
          onClick={() => runtime?.history.undo()}
        />
        <HistoryButton
          icon={Redo2}
          label="다시 실행"
          actionLabel={redoLabel}
          shortcut="⌘⇧Z"
          onClick={() => runtime?.history.redo()}
        />
      </div>

      <Separator />

      <section className="p-3">
        <SectionTitle>메쉬 추가</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {MESH_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            const Icon = PRESET_ICONS[preset.id];
            const shortcut = getPresetShortcut(preset.id);
            return (
              <Button
                key={preset.id}
                variant={isActive ? "default" : "secondary"}
                size="lg"
                // min-w-0: 라벨+단축키가 길어도 그리드 칸을 넘지 않게
                className="min-w-0 justify-start gap-2 pr-1.5"
                disabled={!runtime}
                aria-pressed={isActive}
                aria-keyshortcuts={shortcut ?? undefined}
                onClick={() => runtime?.placement.toggle(preset)}
              >
                <Icon strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-left">
                  {preset.label}
                </span>
                {shortcut && (
                  <Kbd
                    className={
                      isActive ? "bg-primary-foreground/15 text-current" : ""
                    }
                  >
                    {shortcut}
                  </Kbd>
                )}
              </Button>
            );
          })}
        </div>
        <p className="mt-2 flex min-h-5 flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {activePresetId ? (
            <>
              씬을 클릭할 때마다 배치 · <Kbd>Esc</Kbd> / 우클릭 종료
            </>
          ) : (
            "메쉬를 고른 뒤 씬에서 놓을 위치를 클릭하세요."
          )}
        </p>
      </section>

      <Separator />

      <section className="flex min-h-0 flex-1 flex-col p-3 pr-0">
        <SectionTitle>
          씬 <span className="text-muted-foreground/70">({meshes.length})</span>
        </SectionTitle>
        {meshes.length === 0 ? (
          <p className="pr-3 text-xs text-muted-foreground">
            아직 추가된 메쉬가 없습니다.
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <ul className="-mx-1 space-y-0.5">
              {meshes.map((mesh) => {
                const isSelected = mesh === selectedMesh;
                return (
                  <li
                    key={mesh.uniqueId}
                    className={`group flex h-7 items-center rounded-md pr-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                      isSelected
                        ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring/50"
                        : ""
                    }`}
                  >
                    <Button
                      variant="ghost"
                      className="h-full flex-1 justify-start gap-2 px-1.5 font-normal hover:bg-transparent dark:hover:bg-transparent"
                      aria-pressed={isSelected}
                      onClick={() => runtime?.selection.select(mesh)}
                    >
                      <MeshIcon
                        mesh={mesh}
                        className="size-3.5 text-muted-foreground"
                      />
                      <span className="truncate">{mesh.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`${mesh.name} 삭제`}
                      onClick={() =>
                        runtime?.history.execute(
                          createRemoveMeshCommand(runtime.scene, mesh),
                        )
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </section>
    </aside>
  );
}
