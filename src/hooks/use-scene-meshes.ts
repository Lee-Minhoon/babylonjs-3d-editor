"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

const EMPTY: AbstractMesh[] = [];
const getEmpty = () => EMPTY;
const subscribeNoop = () => () => {};

/** scene.meshes는 제자리에서 변경되므로, 변경 시점마다 새 배열 스냅샷을 만든다. */
function createMeshStore(scene: Scene) {
  let snapshot = scene.meshes.slice();

  return {
    subscribe(onChange: () => void) {
      const update = () => {
        snapshot = scene.meshes.slice();
        onChange();
      };
      const added = scene.onNewMeshAddedObservable.add(update);
      const removed = scene.onMeshRemovedObservable.add(update);
      return () => {
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
