"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  getMaterialValues,
  type MaterialValues,
  onMaterialChange,
} from "../lib/mesh-material";

/**
 * 메쉬들의 머티리얼 값을 구독한다 (여러 개 선택이면 함께 편집). 미리보기·undo·파일 열기 모두
 * applyMaterialValues를 거치므로 onMaterialChange 하나로 충분하다. 값이 바뀔 때만 새 스냅샷을 만든다.
 */
function createMaterialStore(meshes: readonly AbstractMesh[]) {
  const read = () =>
    meshes.flatMap((mesh) => {
      const values = getMaterialValues(mesh);
      return values ? [values] : [];
    });
  let snapshot = read();

  return {
    subscribe: (onChange: () => void) => {
      const unsubscribes = meshes.map((mesh) =>
        onMaterialChange(mesh, () => {
          snapshot = read();
          onChange();
        }),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    getSnapshot: () => snapshot,
  };
}

/** PBR 머티리얼이 있는 메쉬들의 값 (고른 순서). 하나도 없으면 빈 배열 */
export function useMeshMaterials(
  meshes: readonly AbstractMesh[],
): readonly MaterialValues[] {
  const store = useMemo(() => createMaterialStore(meshes), [meshes]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
