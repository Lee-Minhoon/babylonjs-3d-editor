"use client";

import { useSyncExternalStore } from "react";

import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import {
  isEditorMesh,
  MESH_PRESETS,
  type MeshPresetId,
  removeEditorMesh,
} from "../lib/mesh-presets";
import type { PlacementTool } from "../lib/placement-tool";
import type { EditorRuntime } from "./editor-viewport";

const subscribeNoop = () => () => {};
const getNull = () => null;

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

type MeshSidebarProps = {
  runtime: EditorRuntime | null;
};

export function MeshSidebar({ runtime }: MeshSidebarProps) {
  const meshes = useSceneMeshes(runtime?.scene ?? null).filter(isEditorMesh);
  const activePresetId = useActivePresetId(runtime?.placement);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 text-sm text-zinc-200">
      <section className="border-b border-zinc-800 p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          메쉬 추가
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {MESH_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={!runtime}
                aria-pressed={isActive}
                onClick={() => runtime?.placement.toggle(preset)}
                className={`rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isActive
                    ? "bg-sky-600 text-white hover:bg-sky-500"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
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
            {meshes.map((mesh) => (
              <li
                key={mesh.uniqueId}
                className="group flex items-center justify-between rounded-md px-1 py-1 hover:bg-zinc-800"
              >
                <span className="truncate">{mesh.name}</span>
                <button
                  type="button"
                  onClick={() => removeEditorMesh(mesh)}
                  aria-label={`${mesh.name} 삭제`}
                  className="rounded px-1.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
