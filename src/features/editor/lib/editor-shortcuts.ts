import type { History } from "./history";
import { createRemoveMeshCommand } from "./mesh-commands";
import { MESH_PRESETS, type MeshPresetId } from "./mesh-presets";
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
 *   1 ~ 8             메쉬 프리셋 배치 모드 토글 (MESH_PRESETS 순서, 상단 숫자열만)
 *   ⌘/Ctrl+Z          undo
 *   ⌘/Ctrl+Shift+Z    redo  (Ctrl+Y도 redo)
 *
 * 예약 (나중 기능용 — 다른 동작에 쓰지 말 것):
 *   ⌘/Ctrl+S 저장 · ⌘/Ctrl+C/V/X 복사/붙여넣기/잘라내기 · ⌘/Ctrl+D 복제 · ⌘/Ctrl+A 전체 선택
 *   F 선택 메쉬로 카메라 포커스 · 숫자패드 카메라 시점
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

/** 프리셋 단축키: MESH_PRESETS 순서대로 1, 2, 3 … (최대 9개) */
const PRESET_SHORTCUTS = new Map(
  MESH_PRESETS.slice(0, 9).map((preset, index) => [preset.id, `${index + 1}`]),
);

/** UI 표시용 프리셋 단축키 ("1" …). 없으면 null */
export function getPresetShortcut(presetId: MeshPresetId): string | null {
  return PRESET_SHORTCUTS.get(presetId) ?? null;
}

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
      } else if (key === "s") {
        // 예약: 저장 기능 전까지는 브라우저 "페이지 저장" 대화상자만 막는다
        event.preventDefault();
      }
      return;
    }

    if (event.shiftKey || event.altKey) return;

    const tool = TOOL_KEYS[key];
    if (tool) {
      tools.setTool(tool);
      return;
    }

    // 상단 숫자열만 (event.code: "Digit1"). 숫자패드("Numpad1")는 카메라 시점용으로 남겨둔다.
    const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
    const preset = digit ? MESH_PRESETS[Number(digit) - 1] : undefined;
    if (preset) {
      placement.toggle(preset);
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
