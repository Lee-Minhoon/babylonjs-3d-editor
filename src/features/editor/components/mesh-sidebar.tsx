"use client";

import type { Scene } from "@babylonjs/core/scene";

import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import {
  addPresetMesh,
  isEditorMesh,
  MESH_PRESETS,
  removeEditorMesh,
} from "../lib/mesh-presets";

type MeshSidebarProps = {
  scene: Scene | null;
};

export function MeshSidebar({ scene }: MeshSidebarProps) {
  const meshes = useSceneMeshes(scene).filter(isEditorMesh);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 text-sm text-zinc-200">
      <section className="border-b border-zinc-800 p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          메쉬 추가
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {MESH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={!scene}
              onClick={() => scene && addPresetMesh(scene, preset)}
              className="rounded-md bg-zinc-800 px-2 py-1.5 text-left transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          씬 <span className="text-zinc-500">({meshes.length})</span>
        </h2>
        {meshes.length === 0 ? (
          <p className="text-zinc-500">위에서 메쉬를 추가해 보세요.</p>
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
