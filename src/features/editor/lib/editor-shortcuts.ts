import type { Scene } from "@babylonjs/core/scene";

import type { AddMenu } from "./add-menu";
import type { CameraView, ViewName } from "./camera-views";
import type { Clipboard } from "./clipboard";
import {
  copySelected,
  cutSelected,
  deleteSelected,
  dropSelectedToFloor,
  duplicateSelected,
  focusSelected,
  hideSelected,
  parentSelected,
  paste,
  showAllHidden,
  startRename,
  unparentSelected,
} from "./editor-actions";
import type { History } from "./history";
import { MESH_PRESETS, type MeshPresetId } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import type { SceneFile } from "./scene-file";
import type { Selection } from "./selection";
import type { ShortcutHelp } from "./shortcut-help";
import type { ToolState, TransformTool } from "./tools";
import type { TransformGizmo } from "./transform-gizmo";

/*
 * 에디터 키보드 단축키를 한 곳에서 처리한다.
 * 도구마다 keydown을 따로 달면 같은 키(Esc 등)의 우선순위가 등록 순서에 묶이므로 여기서 결정한다.
 *
 *   Esc               배치 모드 종료 → (배치 중이 아니면) 선택 해제
 *   R / Shift+R       (배치 중일 때만) 미리보기 90° 회전 / 반대로. 배치 중이 아니면 R은 크기 도구
 *   Delete/Backspace  선택한 메쉬 삭제 (undo 가능)
 *   F                 선택한 메쉬로 카메라 포커스
 *   H / ⌥H            선택한 메쉬 숨기기 / 숨긴 메쉬 모두 보이기
 *   End               선택한 메쉬를 바로 아래 표면에 붙이기
 *   P / ⌥P            부모 지정 (마지막에 고른 것이 부모) / 부모 해제
 *   F2                이름 바꾸기 (하나만 선택했을 때 속성 패널 이름 칸으로)
 *   Q / W / E / R     선택 / 이동 / 회전 / 크기 도구
 *   1 ~ 8             메쉬 프리셋 배치 모드 토글 (MESH_PRESETS 순서, 상단 숫자열만)
 *   ⌘/Ctrl+Z          undo
 *   ⌘/Ctrl+Shift+Z    redo  (Ctrl+Y도 redo)
 *   ⌘/Ctrl+C / X / V  복사 / 잘라내기 / 붙여넣기 (에디터 내부 클립보드)
 *   ⌘/Ctrl+D          복제
 *   ⌘/Ctrl+A          전체 선택 (숨기거나 잠근 메쉬 제외)
 *   ⌘/Ctrl+S          저장 (⌘/Ctrl+Shift+S 다른 이름으로 저장)
 *   ⌘/Ctrl+O          열기
 *   ?                 단축키 도움말 창
 *   Shift+A           검색형 추가 메뉴 (커서가 뷰포트 위면 그 자리, 아니면 가운데)
 *   (새 씬은 단축키 없음 — ⌘N은 브라우저가 가로채 막을 수 없다)
 *
 *   숫자패드 1 / 3 / 7  정면 / 오른쪽 / 위 시점 (⌃와 함께: 뒤 / 왼쪽 / 아래) — Blender 방식
 *   숫자패드 5          원근 ↔ 직교
 */

type EditorShortcutTargets = {
  scene: Scene;
  help: ShortcutHelp;
  addMenu: AddMenu;
  cameraView: CameraView;
  history: History;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
  clipboard: Clipboard;
  sceneFile: SceneFile;
  gizmo: TransformGizmo;
};

const TOOL_KEYS: Record<string, TransformTool> = {
  q: "select",
  w: "move",
  e: "rotate",
  r: "scale",
};

/** 숫자패드 시점: [그냥, ⌃와 함께] */
const NUMPAD_VIEWS: Record<string, [ViewName, ViewName]> = {
  "1": ["front", "back"],
  "3": ["right", "left"],
  "7": ["top", "bottom"],
};

/** UI 표시용 시점 단축키 */
export const VIEW_SHORTCUTS: Record<ViewName, string> = {
  front: "Num1",
  back: "⌃Num1",
  right: "Num3",
  left: "⌃Num3",
  top: "Num7",
  bottom: "⌃Num7",
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
  hide: "H",
  showAll: "⌥H",
  dropToFloor: "End",
  parent: "P",
  unparent: "⌥P",
  orthographic: "Num5",
  rename: "F2",
  rotatePlacement: "R",
  help: "?",
  addMenu: "⇧A",
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
 * 입력칸 안의 ⌘Z / ⌘⇧Z / Ctrl+Y. editor-shortcuts는 입력칸을 건너뛰므로 각 칸이 onKeyDown에서 부른다.
 * 편집 중이면(cancelEdit이 편집을 취소하고 true) 그 편집만 되돌리고, 아니면 히스토리 undo/redo.
 * 처리했으면 true.
 */
export function handleFieldHistoryKey(
  event: {
    key: string;
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    preventDefault(): void;
  },
  history: History,
  cancelEdit: () => boolean,
): boolean {
  const key = getShortcutKey(event);
  if (!(event.metaKey || event.ctrlKey) || (key !== "z" && key !== "y")) {
    return false;
  }
  event.preventDefault();
  if (cancelEdit()) return true;
  if (key === "y" || event.shiftKey) history.redo();
  else history.undo();
  return true;
}

/**
 * 입력 필드에 포커스가 있으면 브라우저 기본 동작(텍스트 편집·undo)을 그대로 둔다.
 * 대화상자(변경 사항 확인 등)·열린 메뉴·슬라이더 안의 키도 에디터로 보내지 않는다
 * — 메뉴는 글자 키로 항목을 찾고(typeahead), 슬라이더는 화살표로 값을 바꾸는 중이라
 * 같은 키가 배치 토글·삭제·도구 전환으로 새면 안 된다.
 */
const SHORTCUT_FREE_ZONE = '[role="slider"]';
/**
 * 팝업형 — 열려 있을 때만 (Base UI는 열린 팝업에 data-open을 붙인다).
 * 대화상자도 여기 — 도움말 창을 Esc로 닫자마자 누른 Q가 닫히는 중인 창에 막히던 버그
 */
const POPUP_ZONE =
  '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]';

/** 단축키 처리기가 건너뛰는 곳(입력창·슬라이더·셀렉트, 열린 팝업)인가. 패널이 ⌘Z를 직접 처리할지 판단할 때도 쓴다 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest(SHORTCUT_FREE_ZONE) !== null
  ) {
    return true;
  }
  // 닫히는 중인 메뉴·대화상자(퇴장 애니메이션, data-open 없음)에는 포커스가 잠깐 남는다
  // — 그때의 키(Esc 직후 ⌘Z 등)는 에디터가 받아야 한다
  return target.closest(POPUP_ZONE)?.closest("[data-open]") != null;
}

export function bindEditorShortcuts({
  scene,
  help,
  addMenu,
  cameraView,
  history,
  placement,
  selection,
  tools,
  clipboard,
  sceneFile,
  gizmo,
}: EditorShortcutTargets): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    const key = getShortcutKey(event);
    const mod = event.metaKey || event.ctrlKey;

    // 기즈모를 끄는 중에는 아무 단축키도 받지 않는다 — 드래그 동안 메쉬가 시작 자세를 기준으로 피벗을 따라가므로,
    // 그 사이 undo·삭제가 끼어들면 변형이 어긋난다
    if (gizmo.isDragging()) {
      event.preventDefault();
      return;
    }

    // 키를 누르고 있을 때의 반복 입력은 undo/redo와 배치 회전(R)만 받는다.
    // 나머지(프리셋 토글·붙여넣기·저장 …)는 한 번만 — 숫자 키를 누르고 있으면 배치가 켜졌다 꺼졌다 한다
    const repeatable = (mod && (key === "z" || key === "y")) || key === "r";
    if (event.repeat && !repeatable) {
      if (mod) event.preventDefault(); // ⌘S 등의 브라우저 동작은 계속 막는다
      return;
    }

    // 숫자패드는 물리 키(event.code)로 본다 — Num Lock이 꺼진 Windows에선 event.key가 "End"·"Home"이라
    // 바닥에 붙이기(End) 등으로 새지 않게 다른 키보다 먼저 처리한다
    const numpad = /^Numpad(\d)$/.exec(event.code)?.[1];
    if (numpad !== undefined) {
      if (event.shiftKey || event.altKey || event.metaKey) return;
      const views = NUMPAD_VIEWS[numpad];
      if (views) {
        event.preventDefault();
        cameraView.setView(views[event.ctrlKey ? 1 : 0]);
      } else if (numpad === "5" && !event.ctrlKey) {
        event.preventDefault();
        cameraView.setOrthographic(!cameraView.isOrthographic());
      }
      return;
    }

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
      } else if (key === "a" && !event.shiftKey) {
        // 페이지 글자 전체 선택 대신
        event.preventDefault();
        selection.selectAll();
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

    // ?는 Shift+/ — 글자 키가 아니라 event.key로 본다 (한글 입력 상태에서도 "?")
    if (key === "?" && !event.altKey) {
      event.preventDefault();
      help.setOpen(true);
      return;
    }

    // ⇧A: 커서가 캔버스 위에 있으면 그 자리에 (scene.pointerX/Y는 캔버스 기준 CSS 픽셀)
    if (key === "a" && event.shiftKey && !event.altKey) {
      event.preventDefault();
      const canvas = scene.getEngine().getRenderingCanvas();
      addMenu.open(
        canvas?.matches(":hover")
          ? { x: scene.pointerX, y: scene.pointerY }
          : null,
      );
      return;
    }

    // ⌥H: 맥에서는 event.key가 "˙"지만 getShortcutKey는 물리 키(KeyH)로 본다
    if (key === "h" && event.altKey && !event.shiftKey) {
      if (showAllHidden({ scene, history })) event.preventDefault();
      return;
    }

    if (key === "p" && event.altKey && !event.shiftKey) {
      if (unparentSelected({ history, selection })) event.preventDefault();
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

    if (key === "f") {
      if (focusSelected({ selection })) event.preventDefault();
      return;
    }

    if (key === "h") {
      hideSelected({ history, selection });
      return;
    }

    if (key === "p") {
      parentSelected({ history, selection });
      return;
    }

    if (key === "end") {
      if (dropSelectedToFloor({ history, selection })) event.preventDefault();
      return;
    }

    if (key === "f2") {
      if (startRename({ selection })) event.preventDefault();
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
