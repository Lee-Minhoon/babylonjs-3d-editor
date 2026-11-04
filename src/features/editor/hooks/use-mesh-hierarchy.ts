"use client";

import { useSyncExternalStore } from "react";

import { getHierarchySnapshot, onHierarchyChange } from "../lib/mesh-hierarchy";

/**
 * 부모-자식 관계를 구독한다. 부모가 바뀔 때마다(setMeshParent) 새 객체라,
 * 돌려받은 getParent로 계산한 값(씬 목록 트리 등)이 그때 다시 계산된다.
 */
export function useMeshHierarchy() {
  return useSyncExternalStore(
    onHierarchyChange,
    getHierarchySnapshot,
    getHierarchySnapshot,
  );
}
