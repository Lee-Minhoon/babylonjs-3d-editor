"use client";

import { type ReactNode, useState } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSceneMeshes } from "@/hooks/use-scene-meshes";
import { useVirtualWindow } from "@/hooks/use-virtual-window";
import { cn } from "@/lib/utils";

import {
  useActivePresetId,
  usePlacementState,
  useSelection,
} from "../hooks/use-editor-state";
import { useMeshFlag } from "../hooks/use-mesh-flags";
import { useMeshHierarchy } from "../hooks/use-mesh-hierarchy";
import { useMeshName } from "../hooks/use-mesh-name";
import { deleteMesh, setParentOf, toggleMeshFlag } from "../lib/editor-actions";
import type { EditorRuntime } from "../lib/editor-runtime";
import { getPresetShortcut, SHORTCUT_LABELS } from "../lib/editor-shortcuts";
import {
  buildSceneTree,
  canSetParent,
  getEditorAncestors,
  getEditorParent,
  type SceneTreeRow,
} from "../lib/mesh-hierarchy";
import {
  inCreationOrder,
  LIGHT_PRESETS,
  MESH_PRESETS,
  type MeshPreset,
} from "../lib/mesh-presets";
import { isAdditiveClick } from "../lib/selection";
import { MeshNameInput } from "./mesh-name-input";
import { MeshIcon, PresetIcon } from "./preset-icons";

function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
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

/** 행 끝의 아이콘 버튼: 켜져 있으면(숨김·잠금) 늘 보이고, 아니면 행에 올렸을 때만 */
const ROW_ACTION_CLASS =
  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100";

/** 씬 목록 끌어 놓기: 끄는 객체들과 놓을 곳 (객체 위 = 그 자식으로, 빈 곳 = 최상위로) */
type SceneListDrag = {
  dragged: readonly AbstractMesh[] | null;
  target: AbstractMesh | "root" | null;
  start(mesh: AbstractMesh): void;
  over(target: AbstractMesh | "root"): boolean;
  drop(target: AbstractMesh | "root"): void;
  end(): void;
};

/** 들여쓰기 한 단계 (px) */
const INDENT = 12;
/** 줄 높이(h-7 = 28px) + 줄 간격(space-y-0.5 = 2px). 보이는 줄만 그릴 때 위치 계산에 쓴다 */
const ROW_STRIDE = 30;

/**
 * 씬 목록 한 줄: 클릭 선택(Shift·⌘/Ctrl은 넣고 빼기), 더블클릭 이름 바꾸기,
 * 잠금·숨기기 토글(undo 가능), 삭제 버튼. 숨긴 메쉬는 흐리게 보이고 선택할 수 없다.
 * 자식은 들여 쓰고, 자식이 있으면 접기 버튼. 끌어서 다른 줄에 놓으면 그 자식이 된다. 우클릭은 선택 메뉴.
 */
function SceneListItem({
  row: { mesh, depth, childCount },
  position,
  total,
  runtime,
  isSelected,
  collapsed,
  onToggleCollapsed,
  drag,
}: {
  row: SceneTreeRow;
  /** 목록에서 몇 번째 줄인지 (1부터) — 보이는 줄만 그리므로 화면 읽기 프로그램에 전체 위치를 알린다 */
  position: number;
  total: number;
  runtime: EditorRuntime;
  isSelected: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  drag: SceneListDrag;
}) {
  const name = useMeshName(mesh);
  const hidden = useMeshFlag(mesh, "hidden");
  const locked = useMeshFlag(mesh, "locked");
  const [editing, setEditing] = useState(false);
  const isDropTarget = drag.target === mesh;

  return (
    <li
      className={cn(
        "group flex h-7 items-center rounded-md pr-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isSelected &&
          "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring/50",
        isDropTarget && "bg-primary/15 ring-1 ring-primary",
        drag.dragged?.includes(mesh) && "opacity-60",
      )}
      style={{ paddingLeft: depth * INDENT }}
      aria-posinset={position}
      aria-setsize={total}
      draggable={!editing}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", name);
        drag.start(mesh);
      }}
      onDragEnd={drag.end}
      // 줄 위의 끌기는 빈 곳(최상위로)으로 넘기지 않는다 — 놓을 수 없는 줄이면 금지 표시
      onDragOver={(event) => {
        event.stopPropagation();
        if (drag.over(mesh)) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        drag.drop(mesh);
      }}
      // 우클릭 메뉴: 안 골라져 있으면 이 줄만 고른 뒤 (뷰포트와 같다)
      onContextMenu={(event) => {
        event.preventDefault();
        if (editing) return;
        if (!runtime.selection.getMeshes().includes(mesh)) {
          runtime.selection.select(mesh);
        }
        runtime.contextMenu.open("selection", {
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      {childCount > 0 ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-4 shrink-0"
          aria-label={`${name} ${collapsed ? "펼치기" : "접기"}`}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight aria-hidden />
          ) : (
            <ChevronDown aria-hidden />
          )}
        </Button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      {editing ? (
        <div className="flex h-full flex-1 items-center gap-2 pl-1">
          <MeshIcon mesh={mesh} className="size-3.5 text-muted-foreground" />
          <MeshNameInput
            mesh={mesh}
            history={runtime.history}
            autoFocus
            className="h-6 px-1.5"
            onDone={() => setEditing(false)}
          />
        </div>
      ) : (
        <Button
          variant="ghost"
          className="h-full min-w-0 flex-1 justify-start gap-2 px-1 font-normal hover:bg-transparent dark:hover:bg-transparent"
          aria-pressed={isSelected}
          onClick={(event) => {
            if (isAdditiveClick(event)) {
              runtime.selection.toggle(mesh);
            } else {
              runtime.selection.select(mesh);
            }
          }}
          onDoubleClick={() => setEditing(true)}
        >
          <MeshIcon mesh={mesh} className="size-3.5 text-muted-foreground" />
          <span className={`truncate ${hidden ? "opacity-50" : ""}`}>
            {name}
          </span>
        </Button>
      )}
      {!editing && (
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            className={locked ? "" : ROW_ACTION_CLASS}
            // aria-pressed는 쓰지 않는다 — 목록의 aria-pressed는 "선택됨"을 뜻한다
            aria-label={`${name} ${locked ? "잠금 풀기" : "잠그기"}`}
            onClick={() => toggleMeshFlag(runtime, mesh, "locked")}
          >
            {locked ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className={hidden ? "" : ROW_ACTION_CLASS}
            aria-label={`${name} ${hidden ? "보이기" : "숨기기"}`}
            onClick={() => toggleMeshFlag(runtime, mesh, "hidden")}
          >
            {hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </>
      )}
      {!editing && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`${name} 삭제`}
          onClick={() => deleteMesh(runtime, mesh)}
        >
          <X aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** 끌어 놓기 상태. 고른 줄을 끌면 고른 것 모두, 아니면 그 줄 하나를 옮긴다 */
function useSceneListDrag(runtime: EditorRuntime | null): SceneListDrag {
  const [dragged, setDragged] = useState<readonly AbstractMesh[] | null>(null);
  const [target, setTarget] = useState<AbstractMesh | "root" | null>(null);

  const canDrop = (to: AbstractMesh | "root") => {
    if (!dragged) return false;
    if (to === "root") return dragged.some((mesh) => getEditorParent(mesh));
    return (
      !dragged.includes(to) &&
      dragged.some(
        (mesh) => getEditorParent(mesh) !== to && canSetParent(mesh, to),
      )
    );
  };
  const end = () => {
    setDragged(null);
    setTarget(null);
  };

  return {
    dragged,
    target,
    start(mesh) {
      const selected = runtime?.selection.getMeshes() ?? [];
      setDragged(selected.includes(mesh) ? selected : [mesh]);
    },
    over(to) {
      const ok = canDrop(to);
      setTarget(ok ? to : null);
      return ok;
    },
    drop(to) {
      if (runtime && dragged && canDrop(to)) {
        setParentOf(runtime, dragged, to === "root" ? null : to);
      }
      end();
    },
    end,
  };
}

/** 고른 객체가 접힌 부모 아래에 있으면 그 부모들을 편다 (뷰포트에서 자식을 골랐을 때) */
function useCollapsed(selected: readonly AbstractMesh[]) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<AbstractMesh>>(
    () => new Set(),
  );
  const [revealed, setRevealed] = useState(selected);
  if (revealed !== selected) {
    setRevealed(selected);
    const ancestors = new Set(selected.flatMap(getEditorAncestors));
    if ([...ancestors].some((mesh) => collapsed.has(mesh))) {
      setCollapsed(
        new Set([...collapsed].filter((mesh) => !ancestors.has(mesh))),
      );
    }
  }
  const toggle = (mesh: AbstractMesh) => {
    const next = new Set(collapsed);
    if (!next.delete(mesh)) next.add(mesh);
    setCollapsed(next);
  };
  return { collapsed, toggle };
}

type MeshSidebarProps = {
  runtime: EditorRuntime | null;
};

/** 프리셋 배치 버튼 (누르면 배치 모드 토글, 켜져 있으면 강조) */
function PresetButton({
  preset,
  runtime,
  active,
  label = preset.label,
}: {
  preset: MeshPreset;
  runtime: EditorRuntime | null;
  active: boolean;
  label?: string;
}) {
  const shortcut = getPresetShortcut(preset.id);
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="lg"
      // min-w-0: 라벨+단축키가 길어도 그리드 칸을 넘지 않게
      className="min-w-0 justify-start gap-2 pr-1.5"
      disabled={!runtime}
      aria-label={label === preset.label ? undefined : preset.label}
      aria-pressed={active}
      aria-keyshortcuts={shortcut ?? undefined}
      onClick={() => runtime?.placement.toggle(preset)}
    >
      <PresetIcon preset={preset.id} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {shortcut && (
        <Kbd className={active ? "bg-primary-foreground/15 text-current" : ""}>
          {shortcut}
        </Kbd>
      )}
    </Button>
  );
}

/** 왼쪽 사이드바: 메쉬·조명 추가(배치 모드) + 씬 목록 */
export function MeshSidebar({ runtime }: MeshSidebarProps) {
  const meshes = inCreationOrder(useSceneMeshes(runtime?.scene ?? null));
  const activePresetId = useActivePresetId(runtime);
  const placement = usePlacementState(runtime);
  const selected = useSelection(runtime);
  const hierarchy = useMeshHierarchy();
  const { collapsed, toggle } = useCollapsed(selected);
  const rows = buildSceneTree(meshes, hierarchy.getParent, collapsed);
  const drag = useSceneListDrag(runtime);
  // 수천 개면 줄마다 includes가 O(N²)이 된다
  const selectedSet = new Set(selected);
  // 보이는 줄만 그린다 (메쉬가 수천 개여도 목록·선택 변경이 느려지지 않게)
  const visible = useVirtualWindow(rows.length, ROW_STRIDE);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-xs text-sidebar-foreground">
      <section className="p-3">
        <SectionTitle>메쉬 추가</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {MESH_PRESETS.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              runtime={runtime}
              active={activePresetId === preset.id}
            />
          ))}
        </div>
        <SectionTitle className="mt-3">조명 추가</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {LIGHT_PRESETS.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              runtime={runtime}
              active={activePresetId === preset.id}
              // 좁은 칸이라 "Directional Light" → "Directional"
              label={preset.label.replace(/ Light$/, "")}
            />
          ))}
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
            "메쉬나 조명을 고른 뒤 씬에서 놓을 위치를 클릭하세요."
          )}
        </p>
      </section>

      <Separator />

      <section className="flex min-h-0 flex-1 flex-col p-3 pr-0">
        <SectionTitle>
          씬 <span className="text-muted-foreground/70">({meshes.length})</span>
        </SectionTitle>
        {!runtime || meshes.length === 0 ? (
          <p className="pr-3 text-xs text-muted-foreground">
            아직 추가된 메쉬가 없습니다.
          </p>
        ) : (
          // 줄 밖(빈 곳)에 놓으면 최상위로
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col rounded-md",
              drag.target === "root" && "bg-primary/10",
            )}
            onDragOver={(event) => {
              if (drag.over("root")) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              drag.drop("root");
            }}
          >
            <ScrollArea
              className="min-h-0 flex-1 pr-3"
              viewportRef={visible.ref}
            >
              <ul
                aria-label="씬 메쉬"
                className="-mx-1 space-y-0.5"
                style={{
                  paddingTop: visible.before,
                  paddingBottom: visible.after,
                }}
              >
                {rows.slice(visible.start, visible.end).map((row, index) => (
                  <SceneListItem
                    key={row.mesh.uniqueId}
                    row={row}
                    position={visible.start + index + 1}
                    total={rows.length}
                    runtime={runtime}
                    isSelected={selectedSet.has(row.mesh)}
                    collapsed={collapsed.has(row.mesh)}
                    onToggleCollapsed={() => toggle(row.mesh)}
                    drag={drag}
                  />
                ))}
              </ul>
            </ScrollArea>
            <p className="min-h-4 pt-1 pr-3 text-[0.6875rem] text-muted-foreground">
              {drag.dragged
                ? "다른 항목 위에 놓으면 그 자식으로, 빈 곳에 놓으면 최상위로"
                : "끌어서 다른 항목 위에 놓으면 자식이 됩니다"}
            </p>
          </div>
        )}
      </section>
    </aside>
  );
}
