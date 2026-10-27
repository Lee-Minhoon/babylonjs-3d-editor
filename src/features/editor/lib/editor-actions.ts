import { captureMeshSnapshot, type Clipboard } from "./clipboard";
import type { History } from "./history";
import { createRemoveMeshCommand } from "./mesh-commands";
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

/** 선택한 메쉬를 삭제한다 (undo 가능) */
export function deleteSelected({
  history,
  selection,
}: Pick<ActionContext, "history" | "selection">): boolean {
  const mesh = selection.getSelected();
  if (!mesh) return false;
  history.execute(createRemoveMeshCommand(mesh.getScene(), mesh));
  return true;
}

/** 선택한 메쉬를 클립보드에 복사 (씬은 그대로, 히스토리 기록 없음) */
export function copySelected({
  selection,
  clipboard,
}: Pick<ActionContext, "selection" | "clipboard">): boolean {
  const mesh = selection.getSelected();
  return mesh ? clipboard.copy(mesh) : false;
}

/** 복사 후 삭제. 삭제는 undo 가능 ("Box 1 잘라내기") */
export function cutSelected({
  history,
  selection,
  clipboard,
}: Pick<ActionContext, "history" | "selection" | "clipboard">): boolean {
  const mesh = selection.getSelected();
  if (!mesh || !clipboard.copy(mesh)) return false;
  history.execute(createRemoveMeshCommand(mesh.getScene(), mesh, "잘라내기"));
  return true;
}

/**
 * 붙여넣기: 클립보드 내용으로 배치 모드를 시작한다.
 * 미리보기가 커서를 따라다니고, 클릭하면 놓이며(undo 가능) 놓은 메쉬가 선택된다.
 */
export function paste({
  selection,
  clipboard,
  placement,
}: Pick<ActionContext, "selection" | "clipboard" | "placement">): boolean {
  const snapshot = clipboard.get();
  if (!snapshot) return false;
  placement.startSnapshot(snapshot, "붙여넣기", (mesh) =>
    selection.select(mesh),
  );
  return true;
}

/** 복제: 선택한 메쉬로 배치 모드를 시작한다 (붙여넣기와 같고, 클립보드는 건드리지 않음) */
export function duplicateSelected({
  selection,
  placement,
}: Pick<ActionContext, "selection" | "placement">): boolean {
  const mesh = selection.getSelected();
  const snapshot = mesh && captureMeshSnapshot(mesh);
  if (!snapshot) return false;
  placement.startSnapshot(snapshot, "복제", (placed) =>
    selection.select(placed),
  );
  return true;
}
