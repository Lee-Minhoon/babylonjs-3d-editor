"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  getTransformValues,
  type TransformValues,
} from "../lib/transform-values";

/**
 * 메쉬들의 위치·회전·크기를 구독한다 (여러 개 선택이면 함께 편집).
 * 기즈모 드래그·undo·패널 입력 등 무엇으로 바뀌든 월드 행렬이 다시 계산될 때 알림이 오므로
 * onAfterWorldMatrixUpdateObservable 하나로 충분하다. 값이 실제로 바뀐 경우에만 새 스냅샷을 만든다.
 */
function createTransformStore(meshes: readonly AbstractMesh[]) {
  const read = () => meshes.map(getTransformValues);
  let snapshot = read();
  let key = JSON.stringify(snapshot);

  return {
    subscribe(onChange: () => void) {
      const observers = meshes.map((mesh) =>
        mesh.onAfterWorldMatrixUpdateObservable.add(() => {
          const next = read();
          const nextKey = JSON.stringify(next);
          if (nextKey === key) return;
          snapshot = next;
          key = nextKey;
          onChange();
        }),
      );
      return () => observers.forEach((observer) => observer.remove());
    },
    getSnapshot: () => snapshot,
  };
}

/** 메쉬마다의 변형 값 (고른 순서) */
export function useMeshTransforms(
  meshes: readonly AbstractMesh[],
): readonly TransformValues[] {
  const store = useMemo(() => createTransformStore(meshes), [meshes]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
