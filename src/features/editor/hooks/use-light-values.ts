"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  getLightValues,
  type LightValues,
  onLightChange,
} from "../lib/editor-lights";

/** 조명들의 값을 구독한다 (applyLightValues가 알린다). 값이 바뀔 때만 새 스냅샷 */
function createLightStore(meshes: readonly AbstractMesh[]) {
  const read = () =>
    meshes.flatMap((mesh) => {
      const values = getLightValues(mesh);
      return values ? [values] : [];
    });
  let snapshot = read();

  return {
    subscribe: (onChange: () => void) => {
      const unsubscribes = meshes.map((mesh) =>
        onLightChange(mesh, () => {
          snapshot = read();
          onChange();
        }),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    getSnapshot: () => snapshot,
  };
}

/** 조명 객체들의 값 (고른 순서). 조명이 아닌 메쉬는 빠진다 */
export function useLightValues(
  meshes: readonly AbstractMesh[],
): readonly LightValues[] {
  const store = useMemo(() => createLightStore(meshes), [meshes]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
