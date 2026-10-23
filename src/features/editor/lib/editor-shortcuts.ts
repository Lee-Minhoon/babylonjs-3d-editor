import type { History } from "./history";
import { createRemoveMeshCommand } from "./mesh-commands";
import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";
import type { ToolState, TransformTool } from "./tools";

/*
 * 에디터 키보드 단축키를 한 곳에서 처리한다.
 * 도구마다 keydown을 따로 달면 같은 키(Esc 등)의 우선순위가 등록 순서에 묶이므로 여기서 결정한다.
 *
 *   Esc               배치 모드 종료 → (배치 중이 아니면) 선택 해제
 *   Delete/Backspace  선택한 메쉬 삭제 (undo 가능)
 *   Q / W / E / R     선택 / 이동 / 회전 / 크기 도구
 *   ⌘/Ctrl+Z          undo
 *   ⌘/Ctrl+Shift+Z    redo  (Ctrl+Y도 redo)
 */

type EditorShortcutTargets = {
  history: History;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
};

const TOOL_KEYS: Record<string, TransformTool> = {
  q: "select",
  w: "move",
  e: "rotate",
  r: "scale",
};

/** 입력 필드에 포커스가 있으면 브라우저 기본 동작(텍스트 편집·undo)을 그대로 둔다. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

export function bindEditorShortcuts({
  history,
  placement,
  selection,
  tools,
}: EditorShortcutTargets): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    const key = event.key.toLowerCase();
    const mod = event.metaKey || event.ctrlKey;

    if (mod && !event.altKey) {
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        history.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        history.redo();
      }
      return;
    }

    const tool = TOOL_KEYS[key];
    if (tool && !event.shiftKey && !event.altKey) {
      tools.setTool(tool);
      return;
    }

    if (key === "escape") {
      if (placement.getActivePresetId()) placement.cancel();
      else selection.select(null);
      return;
    }

    if (key === "delete" || key === "backspace") {
      const mesh = selection.getSelected();
      if (!mesh) return;
      event.preventDefault();
      history.execute(createRemoveMeshCommand(mesh.getScene(), mesh));
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
