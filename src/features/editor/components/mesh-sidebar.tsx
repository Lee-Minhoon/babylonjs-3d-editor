"use client";

import type { ReactNode } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import {
  useActivePresetId,
  usePlacementState,
  useSelection,
} from "../hooks/use-editor-state";
import { getPresetShortcut, SHORTCUT_LABELS } from "../lib/editor-shortcuts";
import { createRemoveMeshCommand } from "../lib/mesh-commands";
import { isEditorMesh, MESH_PRESETS } from "../lib/mesh-presets";
import type { EditorRuntime } from "./editor-viewport";
import { MeshIcon, PRESET_ICONS } from "./preset-icons";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

/** 배치 중 회전 안내: "R 회전 (90°)" */
function RotateHint({ yaw }: { yaw: number }) {
  return (
    <>
      <Kbd>{SHORTCUT_LABELS.rotatePlacement}</Kbd> 회전
      {yaw !== 0 && <span className="tabular-nums">({yaw}°)</span>}
    </>
  );
}

type MeshSidebarProps = {
  runtime: EditorRuntime | null;
};

/** 왼쪽 사이드바: 메쉬 추가(배치 모드) + 씬 목록 */
export function MeshSidebar({ runtime }: MeshSidebarProps) {
  const meshes = useSceneMeshes(runtime?.scene ?? null)
    .filter(isEditorMesh)
    // undo로 다시 붙은 메쉬는 scene.meshes 끝에 들어가므로 생성 순서(uniqueId)로 정렬
    .toSorted((a, b) => a.uniqueId - b.uniqueId);
  const activePresetId = useActivePresetId(runtime);
  const placement = usePlacementState(runtime);
  const selected = useSelection(runtime);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-xs text-sidebar-foreground">
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
          {placement?.kind === "preset" ? (
            <>
              씬을 클릭할 때마다 배치 · <RotateHint yaw={placement.yaw} /> ·{" "}
              <Kbd>{SHORTCUT_LABELS.deselect}</Kbd> / 우클릭 종료
            </>
          ) : placement?.kind === "snapshot" ? (
            <>
              놓을 위치를 클릭해{" "}
              {placement.count > 1 && `메쉬 ${placement.count}개 `}
              {placement.verb} · <RotateHint yaw={placement.yaw} /> ·{" "}
              <Kbd>{SHORTCUT_LABELS.deselect}</Kbd> / 우클릭 취소
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
            <ul aria-label="씬 메쉬" className="-mx-1 space-y-0.5">
              {meshes.map((mesh) => {
                const isSelected = selected.includes(mesh);
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
                      // Shift·⌘/Ctrl+클릭: 선택에 넣고 빼기 (뷰포트와 같음)
                      onClick={(event) => {
                        if (event.shiftKey || event.metaKey || event.ctrlKey) {
                          runtime?.selection.toggle(mesh);
                        } else {
                          runtime?.selection.select(mesh);
                        }
                      }}
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
