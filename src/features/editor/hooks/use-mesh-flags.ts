"use client";

import { useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  getMeshFlag,
  type MeshFlag,
  onAnyMeshFlagChange,
  onMeshFlagChange,
} from "../lib/mesh-flags";

/** 메쉬 하나의 숨김·잠금을 구독한다 (바꾸는 곳은 모두 setMeshFlag를 거친다) */
export function useMeshFlag(mesh: AbstractMesh, flag: MeshFlag): boolean {
  const get = () => getMeshFlag(mesh, flag);
  return useSyncExternalStore(
    (onChange) => onMeshFlagChange(mesh, onChange),
    get,
    get,
  );
}

/** 메쉬들 중 flag가 켜진 개수 (메뉴 항목 활성화용) */
export function useMeshFlagCount(
  meshes: readonly AbstractMesh[],
  flag: MeshFlag,
): number {
  const count = () => meshes.filter((mesh) => getMeshFlag(mesh, flag)).length;
  return useSyncExternalStore(onAnyMeshFlagChange, count, count);
}
