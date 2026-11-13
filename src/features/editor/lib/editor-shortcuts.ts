import type { ViewName } from "./camera-views";
import { type CommandId, EDITOR_COMMANDS } from "./editor-commands";
import type { EditorRuntime } from "./editor-runtime";
import type { History } from "./history";
import { MESH_PRESETS, type MeshPresetId } from "./mesh-presets";
import type { TransformTool } from "./tools";

/*
 * 에디터 키보드 단축키를 한 곳에서 처리한다 — 키 목록의 기준은 아래 SHORTCUTS 표다.
 * 도구마다 keydown을 따로 달면 같은 키(Esc 등)의 우선순위가 등록 순서에 묶이므로 여기서 결정한다.
 *
 * 표의 한 줄이 단축키 하나: 키 조합 + UI 라벨 + 동작. 메뉴·툴팁·도움말이 보여주는 라벨(SHORTCUT_LABELS,
 * VIEW_SHORTCUTS, getPresetShortcut, getToolShortcut)은 모두 이 표에서 나오므로 처리기와 어긋날 수 없다.
 * 메뉴에도 있는 동작은 명령 표(editor-commands)의 run을 가리킨다 — 메뉴와 단축키가 같은 코드를 부른다.
 * 새 단축키 = 줄 하나 추가 (+ editor-reference의 도움말 목록). 같은 키 조합이 여럿이면 앞의 것이 먼저고,
 * run이 false("하지 않음")를 돌려주면 다음 줄로 넘어간다 (배치 중 R은 회전, 아니면 크기 도구).
 *
 * 표에 앞서 처리기가 먼저 보는 것: 입력창·열린 팝업 안의 키는 무시(isTypingTarget), 기즈모를 끄는 중엔 모두 무시,
 * 키를 누르고 있을 때의 반복 입력은 repeatable인 줄만 받는다.
 * (새 씬은 단축키 없음 — ⌘N은 브라우저가 가로채 막을 수 없다)
 */

/** 단축키 판정에 쓰는 키 이벤트 부분 (KeyboardEvent의 부분집합 — 테스트는 이 모양의 객체를 넘긴다) */
export type ShortcutKeyEvent = {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** 키 조합. 적지 않은 보조키는 "안 눌려 있어야 한다" */
type KeyCombo = {
  /** getShortcutKey 결과 (글자는 소문자, 그 외는 event.key 소문자) */
  key?: string;
  /** 물리 키 — 숫자열(Digit1)·숫자패드(Numpad1)처럼 자판 위치로 보는 키 */
  code?: string;
  /** ⌘ 또는 Ctrl */
  mod?: boolean;
  /** Ctrl만 (⌘는 안 됨) — 숫자패드 시점의 반대편 */
  ctrl?: boolean;
  /** "any"면 Shift 여부를 보지 않는다 */
  shift?: boolean | "any";
  alt?: boolean;
};

type ShortcutBinding = KeyCombo & {
  id: string;
  /** UI 표시 ("⌘Z") */
  label: string;
  /** 키를 누르고 있을 때의 반복 입력도 받는다 (undo/redo·배치 회전) */
  repeatable?: boolean;
  /** 처리했을 때 브라우저 기본 동작을 막는다 (기본 true). 글자 키·Esc처럼 막을 게 없으면 false */
  preventDefault?: boolean;
  /** false면 "하지 않음" → 같은 키의 다음 줄로. void는 처리한 것 */
  run: (runtime: EditorRuntime) => boolean | void;
};

/** 명령 표의 동작을 단축키 동작으로 */
const command = (id: CommandId) => (runtime: EditorRuntime) =>
  EDITOR_COMMANDS[id].run(runtime);

/** 도구 키 (툴바 순서) */
const TOOL_KEYS: Record<TransformTool, string> = {
  select: "q",
  move: "w",
  rotate: "e",
  scale: "r",
};

/** 숫자패드 시점 — Blender 방식. ctrl이면 반대편 */
const VIEW_KEYS: Record<ViewName, { numpad: string; ctrl?: boolean }> = {
  front: { numpad: "1" },
  back: { numpad: "1", ctrl: true },
  right: { numpad: "3" },
  left: { numpad: "3", ctrl: true },
  top: { numpad: "7" },
  bottom: { numpad: "7", ctrl: true },
};

/** 프리셋 단축키: MESH_PRESETS 순서대로 1, 2, 3 … (상단 숫자열, 최대 9개) */
const PRESET_DIGITS = MESH_PRESETS.slice(0, 9).map(
  (preset, index) => [preset, `${index + 1}`] as const,
);

/** 이름 있는 단축키 (메뉴·설명서가 SHORTCUT_LABELS.<id>로 라벨을 가져간다) */
const NAMED_SHORTCUTS = [
  // 편집
  {
    id: "undo",
    key: "z",
    mod: true,
    label: "⌘Z",
    repeatable: true,
    run: ({ history }) => history.undo(),
  },
  {
    id: "redo",
    key: "z",
    mod: true,
    shift: true,
    label: "⌘⇧Z",
    repeatable: true,
    run: ({ history }) => history.redo(),
  },
  {
    id: "redoAlt",
    key: "y",
    mod: true,
    shift: "any",
    label: "⌃Y",
    repeatable: true,
    run: ({ history }) => history.redo(),
  },
  { id: "copy", key: "c", mod: true, label: "⌘C", run: command("copy") },
  { id: "cut", key: "x", mod: true, label: "⌘X", run: command("cut") },
  { id: "paste", key: "v", mod: true, label: "⌘V", run: command("paste") },
  {
    id: "duplicate",
    key: "d",
    mod: true,
    label: "⌘D",
    // 브라우저 북마크(⌘D)는 에디터 안에서 항상 막는다 → 선택이 없어도 "처리한 것"으로
    run: (runtime) => {
      EDITOR_COMMANDS.duplicate.run(runtime);
    },
  },
  {
    id: "selectAll",
    key: "a",
    mod: true,
    label: "⌘A",
    // 페이지 글자 전체 선택 대신
    run: (runtime) => {
      EDITOR_COMMANDS.selectAll.run(runtime);
    },
  },
  { id: "rename", key: "f2", label: "F2", run: command("rename") },
  { id: "delete", key: "backspace", label: "⌫", run: command("delete") },
  {
    id: "deleteForward",
    key: "delete",
    label: "Delete",
    run: command("delete"),
  },
  {
    id: "deselect",
    key: "escape",
    label: "Esc",
    preventDefault: false,
    // 박스를 끄는 중이면 박스 취소 (떼도 고르지 않게), 배치 중이면 배치 종료, 아니면 선택 해제
    run: (runtime) => {
      if (runtime.boxSelect.isPending()) runtime.boxSelect.cancel();
      else if (runtime.placement.isActive()) runtime.placement.cancel();
      else EDITOR_COMMANDS.deselect.run(runtime);
    },
  },
  // 파일 (브라우저의 "페이지 저장"·"열기" 대신)
  {
    id: "save",
    key: "s",
    mod: true,
    label: "⌘S",
    run: command("save"),
  },
  {
    id: "saveAs",
    key: "s",
    mod: true,
    shift: true,
    label: "⌘⇧S",
    run: command("saveAs"),
  },
  {
    id: "open",
    key: "o",
    mod: true,
    label: "⌘O",
    run: command("open"),
  },
  // 추가·배치
  {
    id: "addMenu",
    key: "a",
    shift: true,
    label: "⇧A",
    // 커서가 캔버스 위에 있으면 그 자리에 (scene.pointerX/Y는 캔버스 기준 CSS 픽셀)
    run: ({ scene, addMenu }) => {
      const canvas = scene.getEngine().getRenderingCanvas();
      addMenu.open(
        canvas?.matches(":hover")
          ? { x: scene.pointerX, y: scene.pointerY }
          : null,
      );
    },
  },
  {
    id: "rotatePlacement",
    key: "r",
    label: "R",
    repeatable: true,
    preventDefault: false,
    // 배치 중에만 — 아니면 false → 아래의 크기 도구(R)로
    run: ({ placement }) => placement.rotate(1),
  },
  {
    id: "rotatePlacementBack",
    key: "r",
    shift: true,
    label: "⇧R",
    repeatable: true,
    preventDefault: false,
    run: ({ placement }) => placement.rotate(-1),
  },
  // 객체
  { id: "focus", key: "f", label: "F", run: command("focus") },
  {
    id: "hide",
    key: "h",
    label: "H",
    preventDefault: false,
    run: command("hide"),
  },
  { id: "showAll", key: "h", alt: true, label: "⌥H", run: command("showAll") },
  {
    id: "dropToFloor",
    key: "end",
    label: "End",
    run: command("dropToFloor"),
  },
  // 마지막에 고른 것이 부모
  {
    id: "parent",
    key: "p",
    label: "P",
    preventDefault: false,
    run: command("parent"),
  },
  {
    id: "unparent",
    key: "p",
    alt: true,
    label: "⌥P",
    run: command("unparent"),
  },
  // 보기
  {
    id: "orthographic",
    code: "Numpad5",
    ctrl: false,
    label: "Num5",
    run: ({ cameraView }) =>
      cameraView.setOrthographic(!cameraView.isOrthographic()),
  },
  // ?는 Shift+/ — 글자 키가 아니라 event.key로 본다 (한글 입력 상태에서도 "?")
  {
    id: "help",
    key: "?",
    shift: "any",
    label: "?",
    run: command("help"),
  },
] as const satisfies readonly ShortcutBinding[];

export type ShortcutId = (typeof NAMED_SHORTCUTS)[number]["id"];

/** 숫자패드 시점 (⌃와 함께 반대편). 숫자패드는 물리 키로 본다 — Num Lock이 꺼지면 event.key가 "End"·"Home"이다 */
const VIEW_SHORTCUT_BINDINGS: ShortcutBinding[] = (
  Object.entries(VIEW_KEYS) as [ViewName, { numpad: string; ctrl?: boolean }][]
).map(([view, { numpad, ctrl = false }]) => ({
  id: `view:${view}`,
  code: `Numpad${numpad}`,
  ctrl,
  label: `${ctrl ? "⌃" : ""}Num${numpad}`,
  run: ({ cameraView }) => cameraView.setView(view),
}));

const TOOL_SHORTCUT_BINDINGS: ShortcutBinding[] = (
  Object.entries(TOOL_KEYS) as [TransformTool, string][]
).map(([tool, key]) => ({
  id: `tool:${tool}`,
  key,
  label: key.toUpperCase(),
  preventDefault: false,
  run: ({ tools }) => tools.setTool(tool),
}));

/** 상단 숫자열만 (Digit1). 숫자패드(Numpad1)는 시점 */
const PRESET_SHORTCUT_BINDINGS: ShortcutBinding[] = PRESET_DIGITS.map(
  ([preset, digit]) => ({
    id: `preset:${preset.id}`,
    code: `Digit${digit}`,
    label: digit,
    preventDefault: false,
    run: ({ placement }) => placement.toggle(preset),
  }),
);

/**
 * 모든 단축키, 우선순위 순. 숫자패드(물리 키)가 가장 먼저 — Num Lock이 꺼진 Windows에선 Numpad1의 key가
 * "End"라 바닥에 붙이기로 새지 않게. 배치 회전(R)은 이름 있는 줄에 있고 크기 도구(R)는 그 뒤라 배치 중이 아닐 때만 도구가 된다.
 */
const SHORTCUTS: readonly ShortcutBinding[] = [
  ...VIEW_SHORTCUT_BINDINGS,
  ...NAMED_SHORTCUTS,
  ...TOOL_SHORTCUT_BINDINGS,
  ...PRESET_SHORTCUT_BINDINGS,
];

/** UI(메뉴·툴팁·설명서) 표시용 단축키 라벨 — 표에서 나오므로 처리기와 늘 같다 */
export const SHORTCUT_LABELS = Object.fromEntries(
  NAMED_SHORTCUTS.map(({ id, label }) => [id, label]),
) as Record<ShortcutId, string>;

/** id로 단축키 라벨 (명령 표처럼 id를 문자열로 들고 있는 곳용). 없으면 null */
export function getShortcutLabel(id: string): string | null {
  return (SHORTCUT_LABELS as Record<string, string | undefined>)[id] ?? null;
}

/** UI 표시용 시점 단축키 */
export const VIEW_SHORTCUTS = Object.fromEntries(
  VIEW_SHORTCUT_BINDINGS.map(({ id, label }) => [
    id.slice("view:".length),
    label,
  ]),
) as Record<ViewName, string>;

/** UI 표시용 프리셋 단축키 ("1" …). 없으면 null */
export function getPresetShortcut(presetId: MeshPresetId): string | null {
  return PRESET_DIGITS.find(([preset]) => preset.id === presetId)?.[1] ?? null;
}

/** UI 표시용 도구 단축키 ("Q" …) */
export function getToolShortcut(tool: TransformTool): string {
  return TOOL_KEYS[tool].toUpperCase();
}

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

function matches(combo: KeyCombo, event: ShortcutKeyEvent): boolean {
  const keyMatches =
    combo.code !== undefined
      ? event.code === combo.code
      : getShortcutKey(event) === combo.key;
  if (!keyMatches) return false;
  if (combo.ctrl !== undefined) {
    if (event.ctrlKey !== combo.ctrl || event.metaKey) return false;
  } else if ((event.metaKey || event.ctrlKey) !== (combo.mod ?? false)) {
    return false;
  }
  if (combo.shift !== "any" && event.shiftKey !== (combo.shift ?? false)) {
    return false;
  }
  return event.altKey === (combo.alt ?? false);
}

/** 이 키 이벤트에 맞는 단축키 id들 (우선순위 순). 처리기는 앞에서부터 run이 false가 아닌 첫 줄에서 멈춘다 */
export function shortcutCandidates(event: ShortcutKeyEvent): string[] {
  return SHORTCUTS.filter((binding) => matches(binding, event)).map(
    ({ id }) => id,
  );
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

/**
 * 한글(IME) 조합 중의 키인가 — 조합 중의 Enter는 글자 확정용이라 입력칸이 끝내면 마지막 글자가 잘리거나 겹친다.
 * Safari는 조합을 끝내는 Enter에서 isComposing이 false라 keyCode 229(IME 처리 중)도 함께 본다.
 */
export function isComposingKey(event: {
  nativeEvent: { isComposing: boolean };
  keyCode: number;
}): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

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

export function bindEditorShortcuts(runtime: EditorRuntime): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    // 기즈모를 끄는 중에는 아무 단축키도 받지 않는다 — 드래그 동안 메쉬가 시작 자세를 기준으로 피벗을 따라가므로,
    // 그 사이 undo·삭제가 끼어들면 변형이 어긋난다
    if (runtime.gizmo.isDragging()) {
      event.preventDefault();
      return;
    }

    for (const binding of SHORTCUTS) {
      if (!matches(binding, event)) continue;
      // 키를 누르고 있을 때의 반복 입력은 repeatable인 줄만 — 숫자 키를 누르고 있으면 배치가 켜졌다 꺼졌다 한다.
      // ⌘S 등의 브라우저 동작은 반복 중에도 계속 막는다
      if (event.repeat && !binding.repeatable) {
        if (event.metaKey || event.ctrlKey) event.preventDefault();
        return;
      }
      if (binding.run(runtime) === false) continue;
      if (binding.preventDefault !== false) event.preventDefault();
      return;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
