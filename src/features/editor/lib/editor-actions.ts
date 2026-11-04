import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { focusCamera } from "./camera-focus";
import { captureMeshSnapshots, type Clipboard } from "./clipboard";
import {
  type Command,
  createMacroCommand,
  type History,
  macroLabel,
} from "./history";
import {
  type AlignAxis,
  type AlignEdge,
  createAlignCommand,
  createDistributeCommand,
  createDropToFloorCommand,
} from "./mesh-align";
import { createRemoveMeshCommand } from "./mesh-commands";
import {
  createMeshFlagCommand,
  getMeshFlag,
  type MeshFlag,
} from "./mesh-flags";
import { createSetParentCommand, topLevelOnly } from "./mesh-hierarchy";
import { createRenameCommand, MESH_NAME_INPUT_ID } from "./mesh-name";
import { inCreationOrder, type MeshPreset } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";

/*
 * 단축키·메뉴·버튼이 공유하는 에디터 동작.
 * 같은 동작을 여러 입력 경로에서 부를 때 로직이 갈라지지 않도록 여기 둔다.
 * (한 줄짜리 위임 — history.undo() 등 — 은 각 도구를 직접 호출해도 된다)
 * 반환값: 실제로 무언가 했는지 (단축키가 preventDefault 여부를 정하는 데 쓴다)
 */

type ActionContext = {
  scene: Scene;
  history: History;
  selection: Selection;
  clipboard: Clipboard;
  placement: PlacementTool;
};

/** 이름 바꾸기 (undo 가능). 이름이 그대로거나 비었으면 아무것도 하지 않는다 */
export function renameMesh(
  { history }: Pick<ActionContext, "history">,
  mesh: AbstractMesh,
  text: string,
): boolean {
  const command = createRenameCommand(mesh, text);
  if (!command) return false;
  history.execute(command);
  return true;
}

/**
 * 이름 바꾸기 시작 (F2·메뉴): 하나만 선택했을 때 속성 패널의 이름 입력칸으로 포커스를 옮긴다.
 * 메뉴에서 부르면 메뉴가 닫히며 포커스를 트리거로 되돌리므로 다음 프레임에 옮긴다.
 */
export function startRename({
  selection,
}: Pick<ActionContext, "selection">): boolean {
  if (selection.getMeshes().length !== 1) return false;
  requestAnimationFrame(() => {
    const input = document.getElementById(MESH_NAME_INPUT_ID);
    if (!(input instanceof HTMLInputElement)) return;
    input.focus();
    input.select();
  });
  return true;
}

/** 선택한 메쉬들로 카메라 포커스 (F·메뉴). 선택이 없으면 아무것도 하지 않는다 */
export function focusSelected({
  selection,
}: Pick<ActionContext, "selection">): boolean {
  const meshes = selection.getMeshes();
  const camera = meshes[0]?.getScene().activeCamera;
  if (!(camera instanceof ArcRotateCamera)) return false;
  return focusCamera(camera, meshes);
}

/**
 * 메쉬들을 삭제하는 Command 하나 (여러 개여도 undo 한 번). 비어 있으면 아무것도 하지 않는다.
 * 자식은 부모와 함께 지워지므로 조상을 함께 고른 것은 따로 지우지 않는다.
 */
function removeMeshes(
  history: History,
  selected: readonly AbstractMesh[],
  verb: string,
): boolean {
  const meshes = topLevelOnly(selected);
  if (meshes.length === 0) return false;
  const commands = meshes.map((mesh) =>
    createRemoveMeshCommand(mesh.getScene(), mesh, verb),
  );
  history.execute(createMacroCommand(macroLabel(commands, verb), commands));
  return true;
}

/** 선택한 메쉬들을 삭제한다 (undo 가능) */
export function deleteSelected({
  history,
  selection,
}: Pick<ActionContext, "history" | "selection">): boolean {
  return removeMeshes(history, selection.getMeshes(), "삭제");
}

/** 메쉬 하나를 삭제한다 (씬 목록의 삭제 버튼 — 선택과 무관) */
export function deleteMesh(
  { history }: Pick<ActionContext, "history">,
  mesh: AbstractMesh,
): boolean {
  return removeMeshes(history, [mesh], "삭제");
}

/** 선택한 메쉬들을 클립보드에 복사 (씬은 그대로, 히스토리 기록 없음) */
export function copySelected({
  selection,
  clipboard,
}: Pick<ActionContext, "selection" | "clipboard">): boolean {
  return clipboard.copy(selection.getMeshes());
}

/** 복사 후 삭제. 삭제는 undo 가능 ("Box 1 잘라내기" / "메쉬 3개 잘라내기") */
export function cutSelected({
  history,
  selection,
  clipboard,
}: Pick<ActionContext, "history" | "selection" | "clipboard">): boolean {
  if (!clipboard.copy(selection.getMeshes())) return false;
  return removeMeshes(history, selection.getMeshes(), "잘라내기");
}

/**
 * 붙여넣기: 클립보드 내용으로 배치 모드를 시작한다.
 * 미리보기(여러 개면 묶음)가 커서를 따라다니고, 클릭하면 놓이며(undo 가능) 놓은 메쉬들이 선택된다.
 */
export function paste({
  selection,
  clipboard,
  placement,
}: Pick<ActionContext, "selection" | "clipboard" | "placement">): boolean {
  const snapshots = clipboard.get();
  if (!snapshots) return false;
  placement.startSnapshot(snapshots, "붙여넣기", (meshes) =>
    selection.set(meshes),
  );
  return true;
}

/** 복제: 선택한 메쉬들로 배치 모드를 시작한다 (붙여넣기와 같고, 클립보드는 건드리지 않음) */
export function duplicateSelected({
  selection,
  placement,
}: Pick<ActionContext, "selection" | "placement">): boolean {
  const snapshots = captureMeshSnapshots(selection.getMeshes());
  if (snapshots.length === 0) return false;
  placement.startSnapshot(snapshots, "복제", (meshes) => selection.set(meshes));
  return true;
}

/** Command가 있으면 실행하고 true (바뀔 것이 없으면 null → false) */
function run(history: History, command: Command | null): boolean {
  if (!command) return false;
  history.execute(command);
  return true;
}

/** 메쉬 하나의 숨김·잠금을 뒤집는다 (씬 목록의 눈·자물쇠 — 선택과 무관, undo 가능) */
export function toggleMeshFlag(
  { history }: Pick<ActionContext, "history">,
  mesh: AbstractMesh,
  flag: MeshFlag,
): boolean {
  return run(
    history,
    createMeshFlagCommand([mesh], flag, !getMeshFlag(mesh, flag)),
  );
}

/** 선택한 메쉬들을 숨긴다 (H). 숨긴 메쉬는 선택에서 빠진다 */
export function hideSelected({
  history,
  selection,
}: Pick<ActionContext, "history" | "selection">): boolean {
  return run(
    history,
    createMeshFlagCommand(selection.getMeshes(), "hidden", true),
  );
}

/** 숨긴 메쉬를 모두 보인다 (⌥H) */
export function showAllHidden({
  scene,
  history,
}: Pick<ActionContext, "scene" | "history">): boolean {
  return run(
    history,
    createMeshFlagCommand(inCreationOrder(scene.meshes), "hidden", false),
  );
}

/** 선택한 메쉬들을 잠그거나(true) 푼다(false) */
export function setSelectedLocked(
  { history, selection }: Pick<ActionContext, "history" | "selection">,
  locked: boolean,
): boolean {
  return run(
    history,
    createMeshFlagCommand(selection.getMeshes(), "locked", locked),
  );
}

/** 선택한 메쉬들을 바로 아래 표면에 붙인다 (End) */
export function dropSelectedToFloor({
  history,
  selection,
}: Pick<ActionContext, "history" | "selection">): boolean {
  return run(history, createDropToFloorCommand(selection.getMeshes()));
}

/** 선택한 메쉬들을 축 방향으로 정렬 (2개 이상) */
export function alignSelected(
  { history, selection }: Pick<ActionContext, "history" | "selection">,
  axis: AlignAxis,
  edge: AlignEdge,
): boolean {
  return run(history, createAlignCommand(selection.getMeshes(), axis, edge));
}

/** 선택한 메쉬들을 축 방향으로 같은 간격 분배 (3개 이상) */
export function distributeSelected(
  { history, selection }: Pick<ActionContext, "history" | "selection">,
  axis: AlignAxis,
): boolean {
  return run(history, createDistributeCommand(selection.getMeshes(), axis));
}

/** 객체들을 parent의 자식으로 (null이면 최상위로). 씬 목록 끌어 놓기 — 월드 자세 유지, undo 가능 */
export function setParentOf(
  { history }: Pick<ActionContext, "history">,
  meshes: readonly AbstractMesh[],
  parent: AbstractMesh | null,
): boolean {
  return run(history, createSetParentCommand(meshes, parent));
}

/** P: 선택 중 마지막에 고른 것을 부모로, 나머지를 그 자식으로 (Blender의 "활성 객체" 방식) */
export function parentSelected({
  history,
  selection,
}: Pick<ActionContext, "history" | "selection">): boolean {
  const meshes = selection.getMeshes();
  if (meshes.length < 2) return false;
  return setParentOf({ history }, meshes.slice(0, -1), meshes.at(-1)!);
}

/** ⌥P: 선택한 객체들의 부모를 해제해 최상위로 (월드 자세 유지) */
export function unparentSelected({
  history,
  selection,
}: Pick<ActionContext, "history" | "selection">): boolean {
  return setParentOf({ history }, selection.getMeshes(), null);
}

/** 프리셋 배치 시작 (메뉴·검색형 추가 메뉴). 이미 그 프리셋으로 배치 중이면 그대로 둔다 — toggle과 달리 끄지 않는다 */
export function startPresetPlacement(
  placement: PlacementTool,
  preset: MeshPreset,
) {
  if (placement.getActivePresetId() !== preset.id) placement.toggle(preset);
}
