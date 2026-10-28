"use client";

import { useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { onMeshNameChange } from "../lib/mesh-name";

/** 메쉬 이름을 구독한다 (이름 바꾸기·undo는 모두 setMeshName을 거친다) */
export function useMeshName(mesh: AbstractMesh): string {
  return useSyncExternalStore(
    (onChange) => onMeshNameChange(mesh, onChange),
    () => mesh.name,
    () => mesh.name,
  );
}
