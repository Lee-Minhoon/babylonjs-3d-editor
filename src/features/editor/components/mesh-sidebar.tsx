"use client";

import { type ReactNode, useState } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Eye, EyeOff, Lock, LockOpen, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSceneMeshes } from "@/hooks/use-scene-meshes";
import { cn } from "@/lib/utils";

import {
  useActivePresetId,
  usePlacementState,
  useSelection,
} from "../hooks/use-editor-state";
import { useMeshFlag } from "../hooks/use-mesh-flags";
import { useMeshName } from "../hooks/use-mesh-name";
import { deleteMesh, toggleMeshFlag } from "../lib/editor-actions";
import { getPresetShortcut, SHORTCUT_LABELS } from "../lib/editor-shortcuts";
import {
  inCreationOrder,
  LIGHT_PRESETS,
  MESH_PRESETS,
  type MeshPreset,
} from "../lib/mesh-presets";
import { isAdditiveClick } from "../lib/selection";
import type { EditorRuntime } from "./editor-viewport";
import { MeshNameInput } from "./mesh-name-input";
import { MeshIcon, PRESET_ICONS } from "./preset-icons";

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

/**
 * 씬 목록 한 줄: 클릭 선택(Shift·⌘/Ctrl은 넣고 빼기), 더블클릭 이름 바꾸기,
 * 잠금·숨기기 토글(undo 가능), 삭제 버튼. 숨긴 메쉬는 흐리게 보이고 선택할 수 없다.
 */
function SceneListItem({
  mesh,
  runtime,
  isSelected,
}: {
  mesh: AbstractMesh;
  runtime: EditorRuntime;
  isSelected: boolean;
}) {
  const name = useMeshName(mesh);
  const hidden = useMeshFlag(mesh, "hidden");
  const locked = useMeshFlag(mesh, "locked");
  const [editing, setEditing] = useState(false);

  return (
    <li
      className={`group flex h-7 items-center rounded-md pr-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring/50"
          : ""
      }`}
    >
      {editing ? (
        <div className="flex h-full flex-1 items-center gap-2 pl-1.5">
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
          className="h-full flex-1 justify-start gap-2 px-1.5 font-normal hover:bg-transparent dark:hover:bg-transparent"
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
  const Icon = PRESET_ICONS[preset.id];
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
      <Icon strokeWidth={1.75} aria-hidden />
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
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <ul aria-label="씬 메쉬" className="-mx-1 space-y-0.5">
              {meshes.map((mesh) => (
                <SceneListItem
                  key={mesh.uniqueId}
                  mesh={mesh}
                  runtime={runtime}
                  isSelected={selected.includes(mesh)}
                />
              ))}
            </ul>
          </ScrollArea>
        )}
      </section>
    </aside>
  );
}
