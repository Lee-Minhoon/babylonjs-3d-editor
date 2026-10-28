import type { Clipboard } from "./clipboard";
import {
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  paste,
} from "./editor-actions";
import type { History } from "./history";
import { MESH_PRESETS, type MeshPresetId } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import type { SceneFile } from "./scene-file";
import type { Selection } from "./selection";
import type { ToolState, TransformTool } from "./tools";

/*
 * 에디터 키보드 단축키를 한 곳에서 처리한다.
 * 도구마다 keydown을 따로 달면 같은 키(Esc 등)의 우선순위가 등록 순서에 묶이므로 여기서 결정한다.
 *
 *   Esc               배치 모드 종료 → (배치 중이 아니면) 선택 해제
 *   R / Shift+R       (배치 중일 때만) 미리보기 90° 회전 / 반대로. 배치 중이 아니면 R은 크기 도구
 *   Delete/Backspace  선택한 메쉬 삭제 (undo 가능)
 *   Q / W / E / R     선택 / 이동 / 회전 / 크기 도구
 *   1 ~ 8             메쉬 프리셋 배치 모드 토글 (MESH_PRESETS 순서, 상단 숫자열만)
 *   ⌘/Ctrl+Z          undo
 *   ⌘/Ctrl+Shift+Z    redo  (Ctrl+Y도 redo)
 *   ⌘/Ctrl+C / X / V  복사 / 잘라내기 / 붙여넣기 (에디터 내부 클립보드)
 *   ⌘/Ctrl+D          복제
 *   ⌘/Ctrl+S          저장 (⌘/Ctrl+Shift+S 다른 이름으로 저장)
 *   ⌘/Ctrl+O          열기
 *   (새 씬은 단축키 없음 — ⌘N은 브라우저가 가로채 막을 수 없다)
 *
 * 예약 (나중 기능용 — 다른 동작에 쓰지 말 것):
 *   ⌘/Ctrl+A 전체 선택
 *   F 선택 메쉬로 카메라 포커스 · 숫자패드 카메라 시점
 */

type EditorShortcutTargets = {
  history: History;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
  clipboard: Clipboard;
  sceneFile: SceneFile;
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

/** UI 표시용 도구 단축키 ("Q" …) */
export function getToolShortcut(tool: TransformTool): string {
  const key = Object.keys(TOOL_KEYS).find((k) => TOOL_KEYS[k] === tool);
  return key?.toUpperCase() ?? "";
}

/**
 * UI(메뉴·툴팁) 표시용 단축키 라벨. 실제 처리는 아래 onKeyDown이 기준이며 여기와 맞춰야 한다.
 * selectAll·focus: 아직 기능이 없는 예약 키 (메뉴에 비활성으로 표시).
 */
export const SHORTCUT_LABELS = {
  undo: "⌘Z",
  redo: "⌘⇧Z",
  delete: "⌫",
  deselect: "Esc",
  save: "⌘S",
  saveAs: "⌘⇧S",
  open: "⌘O",
  copy: "⌘C",
  paste: "⌘V",
  cut: "⌘X",
  duplicate: "⌘D",
  selectAll: "⌘A",
  focus: "F",
  rotatePlacement: "R",
  rotatePlacementBack: "⇧R",
} as const;

/**
 * 단축키 판정용 키 이름 (소문자). 글자 키는 event.code(물리 키 위치)로 본다
 * → 한글 입력 상태에서 Q를 누르면 event.key는 "ㅂ"이지만 여기선 "q".
 * (⌘/Ctrl·Shift 조합도 마찬가지다. 글자 외의 키 — Escape, Delete … — 는 event.key 그대로)
 * 입력창 안의 단축키(⌘Z 등)를 직접 처리하는 컴포넌트도 이 함수를 쓴다.
 */
export function getShortcutKey(event: { key: string; code: string }): string {
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
  return letter ? letter.toLowerCase() : event.key.toLowerCase();
}

/**
 * 입력 필드에 포커스가 있으면 브라우저 기본 동작(텍스트 편집·undo)을 그대로 둔다.
 * 대화상자(변경 사항 확인 등) 안의 키도 에디터로 보내지 않는다.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.closest('[role="dialog"], [role="alertdialog"]') !== null)
  );
}

export function bindEditorShortcuts({
  history,
  placement,
  selection,
  tools,
  clipboard,
  sceneFile,
}: EditorShortcutTargets): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    const key = getShortcutKey(event);
    const mod = event.metaKey || event.ctrlKey;

    if (mod && !event.altKey) {
      const context = { history, selection, clipboard, placement };
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        history.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        history.redo();
      } else if (key === "c" && !event.shiftKey) {
        if (copySelected(context)) event.preventDefault();
      } else if (key === "x" && !event.shiftKey) {
        if (cutSelected(context)) event.preventDefault();
      } else if (key === "v" && !event.shiftKey) {
        if (paste(context)) event.preventDefault();
      } else if (key === "d" && !event.shiftKey) {
        // 브라우저 북마크(⌘D)는 에디터 안에서 항상 막는다
        event.preventDefault();
        duplicateSelected(context);
      } else if (key === "s") {
        // 브라우저 "페이지 저장" 대화상자 대신
        event.preventDefault();
        void (event.shiftKey ? sceneFile.saveAs() : sceneFile.save());
      } else if (key === "o" && !event.shiftKey) {
        event.preventDefault();
        void sceneFile.open();
      }
      return;
    }

    // 배치 중에는 R이 미리보기 회전 (크기 도구 전환보다 우선)
    if (
      key === "r" &&
      !event.altKey &&
      placement.rotate(event.shiftKey ? -1 : 1)
    ) {
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
      if (placement.isActive()) placement.cancel();
      else selection.select(null);
      return;
    }

    if (key === "delete" || key === "backspace") {
      if (deleteSelected({ history, selection })) event.preventDefault();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
