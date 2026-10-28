"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  getMaterialValues,
  type MaterialValues,
  onMaterialChange,
} from "../lib/mesh-material";

/**
 * 메쉬의 머티리얼 값을 구독한다. 미리보기·undo·파일 열기 모두 applyMaterialValues를 거치므로
 * onMaterialChange 하나로 충분하다. 값이 바뀔 때만 새 스냅샷을 만든다.
 */
function createMaterialStore(mesh: AbstractMesh) {
  let snapshot = getMaterialValues(mesh);

  return {
    subscribe: (onChange: () => void) =>
      onMaterialChange(mesh, () => {
        snapshot = getMaterialValues(mesh);
        onChange();
      }),
    getSnapshot: () => snapshot,
  };
}

export function useMeshMaterial(mesh: AbstractMesh): MaterialValues | null {
  const store = useMemo(() => createMaterialStore(mesh), [mesh]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
