"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { Scene } from "@babylonjs/core/scene";

import {
  getSceneSettings,
  onSceneSettingsChange,
  type SceneSettings,
} from "../lib/scene-settings";

/** 씬 설정을 구독한다. 바꾸는 곳은 모두 applySceneSettings를 거친다 (값이 바뀔 때만 새 스냅샷) */
function createSceneSettingsStore(scene: Scene) {
  let snapshot = getSceneSettings(scene);

  return {
    subscribe: (onChange: () => void) =>
      onSceneSettingsChange(() => {
        snapshot = getSceneSettings(scene);
        onChange();
      }),
    getSnapshot: () => snapshot,
  };
}

export function useSceneSettings(scene: Scene): SceneSettings {
  const store = useMemo(() => createSceneSettingsStore(scene), [scene]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
