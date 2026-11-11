"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

const EMPTY: AbstractMesh[] = [];
const getEmpty = () => EMPTY;
const subscribeNoop = () => () => {};

/**
 * scene.meshes는 제자리에서 변경되므로 바뀔 때마다 새 배열 스냅샷을 만든다.
 * 한 동작에서 여러 메쉬가 들고 나면(1만 개 삭제·열기) 끝난 뒤 한 번만 — 메쉬마다 복사하면 O(N²)이다.
 */
function createMeshStore(scene: Scene) {
  let snapshot = scene.meshes.slice();

  return {
    subscribe(onChange: () => void) {
      let queued = false;
      let active = true;
      const update = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          snapshot = scene.meshes.slice();
          if (active) onChange();
        });
      };
      const added = scene.onNewMeshAddedObservable.add(update);
      const removed = scene.onMeshRemovedObservable.add(update);
      return () => {
        active = false;
        added.remove();
        removed.remove();
      };
    },
    getSnapshot: () => snapshot,
  };
}

/** 씬의 메쉬 목록을 구독한다. 메쉬가 추가/제거되면 리렌더된다. */
export function useSceneMeshes(scene: Scene | null): AbstractMesh[] {
  const store = useMemo(() => (scene ? createMeshStore(scene) : null), [scene]);

  return useSyncExternalStore(
    store?.subscribe ?? subscribeNoop,
    store?.getSnapshot ?? getEmpty,
    getEmpty,
  );
}
