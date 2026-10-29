import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { captureMeshSnapshots, type Clipboard } from "./clipboard";
import { createMacroCommand, type History, macroLabel } from "./history";
import { createRemoveMeshCommand } from "./mesh-commands";
import { createRenameCommand, MESH_NAME_INPUT_ID } from "./mesh-name";
import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";

/*
 * 단축키·메뉴·버튼이 공유하는 에디터 동작.
 * 같은 동작을 여러 입력 경로에서 부를 때 로직이 갈라지지 않도록 여기 둔다.
 * (한 줄짜리 위임 — history.undo() 등 — 은 각 도구를 직접 호출해도 된다)
 * 반환값: 실제로 무언가 했는지 (단축키가 preventDefault 여부를 정하는 데 쓴다)
 */

type ActionContext = {
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

/** 메쉬들을 삭제하는 Command 하나 (여러 개여도 undo 한 번). 비어 있으면 아무것도 하지 않는다 */
function removeMeshes(
  history: History,
  meshes: readonly AbstractMesh[],
  verb: string,
): boolean {
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
