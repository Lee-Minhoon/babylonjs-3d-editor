"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { getShapeParams, type ShapeParams } from "../lib/mesh-presets";
import { onShapeChange } from "../lib/mesh-shape";

/** 메쉬들의 모양 값을 구독한다 (applyShapeParams가 알린다). 값이 바뀔 때만 새 스냅샷 */
function createShapeStore(meshes: readonly AbstractMesh[]) {
  const read = () =>
    meshes.flatMap((mesh) => {
      const shape = getShapeParams(mesh);
      return shape ? [shape] : [];
    });
  let snapshot = read();

  return {
    subscribe: (onChange: () => void) => {
      const unsubscribes = meshes.map((mesh) =>
        onShapeChange(mesh, () => {
          snapshot = read();
          onChange();
        }),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    getSnapshot: () => snapshot,
  };
}

/** 에디터 메쉬들의 모양 값 (고른 순서) */
export function useMeshShapes(
  meshes: readonly AbstractMesh[],
): readonly ShapeParams[] {
  const store = useMemo(() => createShapeStore(meshes), [meshes]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
