import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { createKeyedListeners, createListeners } from "@/lib/listeners";

import { type Command, createMacroCommand, macroLabel } from "./history";
import { isEditorMesh } from "./mesh-presets";

/*
 * 메쉬 숨기기·잠금 (씬 목록의 눈·자물쇠, 객체 메뉴, H / ⌥H).
 *   - 숨김(hidden): 화면에 그리지 않는다 (mesh.isVisible). 선택할 수 없고, 숨기면 선택에서 빠진다.
 *                   배치 표면·바닥에 붙이기 대상도 아니다.
 *   - 잠금(locked): 뷰포트 클릭·전체 선택으로 고를 수 없다 (Unity의 pickability와 같음).
 *                   씬 목록에서는 고를 수 있고 편집도 된다. 배치·바닥에 붙이기의 표면으로는 계속 쓴다
 *                   — 바닥판처럼 "건드리지 않을 배경"을 잠그기 때문.
 * Babylon은 이 값의 변경을 알려주지 않으므로 바꾸는 곳은 모두 setMeshFlag를 거친다 (mesh-name과 같은 방식).
 * 두 상태는 씬 파일에 저장되고 undo 대상이다. 복사·복제한 메쉬에는 따라가지 않는다 (새 메쉬는 늘 보이고 풀려 있다).
 */

export type MeshFlag = "hidden" | "locked";

const lockedMeshes = new WeakSet<AbstractMesh>();
const flagChanged = createKeyedListeners<AbstractMesh>();
const anyFlagChanged = createListeners();

export function getMeshFlag(mesh: AbstractMesh, flag: MeshFlag): boolean {
  return flag === "hidden" ? !mesh.isVisible : lockedMeshes.has(mesh);
}

export function setMeshFlag(
  mesh: AbstractMesh,
  flag: MeshFlag,
  value: boolean,
) {
  if (getMeshFlag(mesh, flag) === value) return;
  if (flag === "hidden") mesh.isVisible = !value;
  else if (value) lockedMeshes.add(mesh);
  else lockedMeshes.delete(mesh);
  flagChanged.emit(mesh);
  anyFlagChanged.emit();
}

/** 이 메쉬의 숨김·잠금이 바뀌면 호출된다 */
export const onMeshFlagChange = flagChanged.subscribe;
/** 어떤 메쉬든 숨김·잠금이 바뀌면 호출된다 (선택에서 숨긴 메쉬 빼기 등) */
export const onAnyMeshFlagChange = anyFlagChanged.subscribe;

/** 뷰포트 클릭·전체 선택으로 고를 수 있는 에디터 메쉬 (숨기지도 잠그지도 않음) */
export function isPickableInViewport(mesh: AbstractMesh): boolean {
  return (
    isEditorMesh(mesh) &&
    !getMeshFlag(mesh, "hidden") &&
    !getMeshFlag(mesh, "locked")
  );
}

const FLAG_VERBS: Record<MeshFlag, Record<"on" | "off", string>> = {
  hidden: { on: "숨기기", off: "보이기" },
  locked: { on: "잠금", off: "잠금 해제" },
};

/**
 * 메쉬들의 숨김·잠금을 value로 바꾸는 Command ("Box 1 숨기기" / "메쉬 3개 잠금").
 * 이미 그 값인 메쉬는 건너뛰고, 바꿀 메쉬가 없으면 null.
 */
export function createMeshFlagCommand(
  meshes: readonly AbstractMesh[],
  flag: MeshFlag,
  value: boolean,
): Command | null {
  const verb = FLAG_VERBS[flag][value ? "on" : "off"];
  const commands = meshes
    .filter((mesh) => getMeshFlag(mesh, flag) !== value)
    .map((mesh): Command => ({
      label: `${mesh.name} ${verb}`,
      execute: () => setMeshFlag(mesh, flag, value),
      undo: () => setMeshFlag(mesh, flag, !value),
    }));
  if (commands.length === 0) return null;
  return createMacroCommand(macroLabel(commands, verb), commands);
}
