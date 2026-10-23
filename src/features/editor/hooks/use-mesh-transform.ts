"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  getTransformValues,
  type TransformValues,
} from "../lib/transform-values";

/**
 * 메쉬의 위치·회전·크기를 구독한다.
 * 기즈모 드래그·undo·패널 입력 등 무엇으로 바뀌든 월드 행렬이 다시 계산될 때 알림이 오므로
 * onAfterWorldMatrixUpdateObservable 하나로 충분하다. 값이 실제로 바뀐 경우에만 새 스냅샷을 만든다.
 */
function createTransformStore(mesh: AbstractMesh) {
  let snapshot = getTransformValues(mesh);
  let key = JSON.stringify(snapshot);

  return {
    subscribe(onChange: () => void) {
      const observer = mesh.onAfterWorldMatrixUpdateObservable.add(() => {
        const next = getTransformValues(mesh);
        const nextKey = JSON.stringify(next);
        if (nextKey === key) return;
        snapshot = next;
        key = nextKey;
        onChange();
      });
      return () => observer.remove();
    },
    getSnapshot: () => snapshot,
  };
}

export function useMeshTransform(mesh: AbstractMesh): TransformValues {
  const store = useMemo(() => createTransformStore(mesh), [mesh]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
