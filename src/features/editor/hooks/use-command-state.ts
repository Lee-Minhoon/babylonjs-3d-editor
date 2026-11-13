"use client";

import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import type { CommandState } from "../lib/editor-commands";
import type { EditorRuntime } from "../lib/editor-runtime";
import { canSetParent, topLevelOnly } from "../lib/mesh-hierarchy";
import { inCreationOrder } from "../lib/mesh-presets";
import { useClipboardHasContent, useSelection } from "./use-editor-state";
import { useMeshFlagCount } from "./use-mesh-flags";
import { useMeshHierarchy } from "./use-mesh-hierarchy";

/** 명령 표(editor-commands)의 활성 조건이 보는 상태 — 선택·클립보드·씬의 요약. 메뉴바와 우클릭 메뉴가 같은 값을 쓴다 */
export function useCommandState(runtime: EditorRuntime | null): CommandState {
  const selected = useSelection(runtime);
  const meshes = inCreationOrder(useSceneMeshes(runtime?.scene ?? null));
  const hiddenCount = useMeshFlagCount(meshes, "hidden");
  const lockedCount = useMeshFlagCount(selected, "locked");
  const hierarchy = useMeshHierarchy();
  const canPaste = useClipboardHasContent(runtime);
  // 부모 지정(parentSelected)과 같은 규칙: 마지막에 고른 것이 부모, 나머지 중 바뀔 것이 하나라도 있어야 한다
  const parent = selected.length >= 2 ? selected.at(-1)! : null;
  const canParent =
    parent !== null &&
    topLevelOnly(selected.slice(0, -1)).some(
      (mesh) =>
        hierarchy.getParent(mesh) !== parent && canSetParent(mesh, parent),
    );
  return {
    selectionCount: selected.length,
    lockedCount,
    hasParent: selected.some((mesh) => hierarchy.getParent(mesh)),
    canParent,
    hiddenCount,
    meshCount: meshes.length,
    canPaste,
  };
}
