import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { Command } from "./history";
import { findPreset, getPresetId, reserveName } from "./mesh-presets";

/*
 * 메쉬 이름 바꾸기. Babylon은 이름 변경을 알려주지 않으므로 바꾸는 곳은 모두 setMeshName을 거치고,
 * 화면(씬 목록·속성 패널)은 onMeshNameChange로 구독한다 (mesh-material과 같은 방식).
 * 같은 이름은 허용한다 (Unity처럼). 앞뒤 공백은 지우고, 빈 이름은 받지 않는다.
 */

/** 속성 패널의 이름 입력칸 id (F2·메뉴 "이름 바꾸기"가 여기로 포커스를 옮긴다) */
export const MESH_NAME_INPUT_ID = "mesh-name-input";

const listeners = new Map<AbstractMesh, Set<() => void>>();

/** 입력값을 이름으로: 앞뒤 공백 제거, 비면 null */
export function normalizeMeshName(text: string): string | null {
  const name = text.trim();
  return name === "" ? null : name;
}

export function setMeshName(mesh: AbstractMesh, name: string) {
  mesh.name = name;
  // "Box 9"로 바꾸면 다음 새 박스는 "Box 10"
  const presetId = getPresetId(mesh);
  const preset = presetId && findPreset(presetId);
  if (preset) reserveName(mesh.getScene(), preset, name);
  listeners.get(mesh)?.forEach((listener) => listener());
}

/** 이 메쉬의 이름이 바뀌면 호출된다 */
export function onMeshNameChange(
  mesh: AbstractMesh,
  listener: () => void,
): () => void {
  let set = listeners.get(mesh);
  if (!set) listeners.set(mesh, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(mesh);
  };
}

/** 이름 바꾸기 Command ("Box 1 이름 변경"). 이름이 그대로거나 비었으면 null */
export function createRenameCommand(
  mesh: AbstractMesh,
  text: string,
): Command | null {
  const before = mesh.name;
  const after = normalizeMeshName(text);
  if (!after || after === before) return null;
  return {
    label: `${before} 이름 변경`,
    execute: () => setMeshName(mesh, after),
    undo: () => setMeshName(mesh, before),
  };
}
