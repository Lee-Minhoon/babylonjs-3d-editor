"use client";

import { useSyncExternalStore } from "react";

import {
  Box,
  Cone,
  Cylinder,
  Gem,
  Globe,
  type LucideIcon,
  Pill,
  Redo2,
  Square,
  Torus,
  Undo2,
  X,
} from "lucide-react";

import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import type { History, HistoryState } from "../lib/history";
import { createRemoveMeshCommand } from "../lib/mesh-commands";
import {
  getPresetId,
  isEditorMesh,
  MESH_PRESETS,
  type MeshPresetId,
} from "../lib/mesh-presets";
import type { PlacementTool } from "../lib/placement-tool";
import type { EditorRuntime } from "./editor-viewport";

/**
 * 프리셋 아이콘. lib(mesh-presets)에 UI 의존성을 넣지 않으려고 여기서 매핑한다.
 * Record<MeshPresetId, …>라서 프리셋을 추가하고 아이콘을 빠뜨리면 타입 에러가 난다.
 */
const PRESET_ICONS: Record<MeshPresetId, LucideIcon> = {
  box: Box,
  sphere: Globe,
  "ico-sphere": Gem,
  cylinder: Cylinder,
  cone: Cone,
  capsule: Pill,
  torus: Torus,
  plane: Square,
};

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

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 text-sm text-zinc-200">
      <div className="flex gap-1.5 border-b border-zinc-800 p-3">
        <button
          type="button"
          disabled={!undoLabel}
          onClick={() => runtime?.history.undo()}
          title={undoLabel ? `실행 취소: ${undoLabel} (⌘/Ctrl+Z)` : "실행 취소"}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1.5 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 className="size-4" aria-hidden />
          실행 취소
        </button>
        <button
          type="button"
          disabled={!redoLabel}
          onClick={() => runtime?.history.redo()}
          title={
            redoLabel ? `다시 실행: ${redoLabel} (⌘/Ctrl+Shift+Z)` : "다시 실행"
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1.5 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Redo2 className="size-4" aria-hidden />
          다시 실행
        </button>
      </div>

      <section className="border-b border-zinc-800 p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          메쉬 추가
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {MESH_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            const Icon = PRESET_ICONS[preset.id];
            return (
              <button
                key={preset.id}
                type="button"
                disabled={!runtime}
                aria-pressed={isActive}
                onClick={() => runtime?.placement.toggle(preset)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isActive
                    ? "bg-sky-600 text-white hover:bg-sky-500"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                <Icon
                  className={`size-4 shrink-0 ${isActive ? "text-white" : "text-zinc-400"}`}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {preset.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 min-h-8 text-xs leading-4 text-zinc-500">
          {activePresetId ? (
            <>
              씬을 클릭할 때마다 배치 · <kbd className="text-zinc-300">Esc</kbd>
              /우클릭 종료
            </>
          ) : (
            "메쉬를 고른 뒤 씬에서 놓을 위치를 클릭하세요."
          )}
        </p>
      </section>

      <section className="flex min-h-0 flex-1 flex-col p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          씬 <span className="text-zinc-500">({meshes.length})</span>
        </h2>
        {meshes.length === 0 ? (
          <p className="text-zinc-500">아직 추가된 메쉬가 없습니다.</p>
        ) : (
          <ul className="-mx-1 flex-1 space-y-0.5 overflow-y-auto">
            {meshes.map((mesh) => {
              const presetId = getPresetId(mesh);
              const Icon = presetId ? PRESET_ICONS[presetId] : Box;
              return (
                <li
                  key={mesh.uniqueId}
                  className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-zinc-800"
                >
                  <Icon
                    className="size-3.5 shrink-0 text-zinc-500"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{mesh.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      runtime?.history.execute(
                        createRemoveMeshCommand(runtime.scene, mesh),
                      )
                    }
                    aria-label={`${mesh.name} 삭제`}
                    className="rounded p-0.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:opacity-100"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
