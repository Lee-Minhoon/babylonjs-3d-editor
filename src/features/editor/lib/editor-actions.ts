import type { History } from "./history";
import { createRemoveMeshCommand } from "./mesh-commands";
import type { Selection } from "./selection";

/*
 * 단축키·메뉴·버튼이 공유하는 에디터 동작.
 * 같은 동작을 여러 입력 경로에서 부를 때 로직이 갈라지지 않도록 여기 둔다.
 * (한 줄짜리 위임 — history.undo() 등 — 은 각 도구를 직접 호출해도 된다)
 */

/** 선택한 메쉬를 삭제한다 (undo 가능). 선택이 없으면 false */
export function deleteSelected(
  history: History,
  selection: Selection,
): boolean {
  const mesh = selection.getSelected();
  if (!mesh) return false;
  history.execute(createRemoveMeshCommand(mesh.getScene(), mesh));
  return true;
}
