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
  setSelectedLocked,
  showAllHidden,
  startRename,
  unparentSelected,
} from "./editor-actions";
import type { EditorRuntime } from "./editor-runtime";

/*
 * 메뉴바·우클릭 메뉴·단축키가 함께 쓰는 명령 표 — "메뉴 글자 + 단축키 + 활성 조건 + 동작"의 단일 출처.
 * 메뉴는 id로 항목을 나열하고(그룹·구분선·순서는 메뉴가 정한다), 키맵 표의 run은 여기의 run을 가리킨다.
 * 같은 동작을 새 표면(툴바 버튼 등)에 붙일 땐 여기 줄을 쓰고, 새 동작은 여기에 줄을 추가한다 (동작 구현은 editor-actions).
 * enabled는 CommandState(선택·클립보드·씬 상태의 요약, hooks/use-command-state)만 본다 → 메뉴마다 조건이 어긋나지 않는다.
 */

export type CommandState = {
  /** 고른 객체 수 */
  selectionCount: number;
  /** 고른 것 중 잠근 수 */
  lockedCount: number;
  /** 고른 것 중 부모가 있는 게 있는지 */
  hasParent: boolean;
  /** 마지막에 고른 것을 부모로 삼을 수 있는 게 있는지 (이미 그 자식이거나 그 조상이면 없다) */
  canParent: boolean;
  /** 씬에서 숨긴 객체 수 */
  hiddenCount: number;
  /** 씬의 에디터 객체 수 */
  meshCount: number;
  canPaste: boolean;
};

export type EditorCommand = {
  label: string;
  /**
   * 메뉴에 보일 단축키 — 키맵 표(editor-shortcuts)의 id. 키맵 표가 이 표를 참조하므로 타입으로 묶으면 순환이라
   * 문자열로 두고, 실제로 있는 id인지는 editor-commands.test가 확인한다
   */
  shortcut?: string;
  variant?: "destructive";
  enabled: (state: CommandState) => boolean;
  /** 동작. false면 "하지 않음" (단축키가 preventDefault 여부를 정하는 데 쓴다) */
  run: (runtime: EditorRuntime) => boolean | void;
};

const hasSelection = (state: CommandState) => state.selectionCount > 0;
const always = () => true;

export const EDITOR_COMMANDS = {
  // 파일
  newScene: {
    label: "새 씬",
    enabled: always,
    run: ({ sceneFile }) => void sceneFile.newScene(),
  },
  open: {
    label: "열기…",
    shortcut: "open",
    enabled: always,
    run: ({ sceneFile }) => void sceneFile.open(),
  },
  save: {
    label: "저장",
    shortcut: "save",
    enabled: always,
    run: ({ sceneFile }) => void sceneFile.save(),
  },
  saveAs: {
    label: "다른 이름으로 저장…",
    shortcut: "saveAs",
    enabled: always,
    run: ({ sceneFile }) => void sceneFile.saveAs(),
  },
  importModel: {
    label: "모델 가져오기(.glb)…",
    enabled: always,
    run: ({ assetImport }) => void assetImport.importModel(),
  },
  exportGlb: {
    label: "glTF(.glb)로 내보내기…",
    enabled: always,
    run: ({ sceneExport }) => void sceneExport.exportGlb(),
  },
  screenshot: {
    label: "스크린샷 저장…",
    enabled: always,
    run: ({ sceneExport }) => void sceneExport.saveScreenshot(),
  },
  // 편집
  cut: {
    label: "잘라내기",
    shortcut: "cut",
    enabled: hasSelection,
    run: cutSelected,
  },
  copy: {
    label: "복사",
    shortcut: "copy",
    enabled: hasSelection,
    run: copySelected,
  },
  paste: {
    label: "붙여넣기",
    shortcut: "paste",
    enabled: (state) => state.canPaste,
    run: paste,
  },
  duplicate: {
    label: "복제",
    shortcut: "duplicate",
    enabled: hasSelection,
    run: duplicateSelected,
  },
  rename: {
    label: "이름 바꾸기",
    shortcut: "rename",
    enabled: (state) => state.selectionCount === 1,
    run: startRename,
  },
  delete: {
    label: "삭제",
    shortcut: "delete",
    variant: "destructive",
    enabled: hasSelection,
    run: deleteSelected,
  },
  selectAll: {
    label: "전체 선택",
    shortcut: "selectAll",
    enabled: (state) => state.meshCount > 0,
    run: ({ selection }) => selection.selectAll(),
  },
  deselect: {
    label: "선택 해제",
    shortcut: "deselect",
    enabled: hasSelection,
    run: ({ selection }) => selection.select(null),
  },
  hide: {
    label: "숨기기",
    shortcut: "hide",
    enabled: hasSelection,
    run: hideSelected,
  },
  showAll: {
    label: "숨긴 메쉬 모두 보이기",
    shortcut: "showAll",
    enabled: (state) => state.hiddenCount > 0,
    run: showAllHidden,
  },
  lock: {
    label: "잠그기",
    enabled: (state) =>
      hasSelection(state) && state.lockedCount < state.selectionCount,
    run: (runtime) => setSelectedLocked(runtime, true),
  },
  unlock: {
    label: "잠금 풀기",
    enabled: (state) => state.lockedCount > 0,
    run: (runtime) => setSelectedLocked(runtime, false),
  },
  parent: {
    label: "부모 지정 (마지막에 고른 것)",
    shortcut: "parent",
    enabled: (state) => state.canParent,
    run: parentSelected,
  },
  unparent: {
    label: "부모 해제",
    shortcut: "unparent",
    enabled: (state) => state.hasParent,
    run: unparentSelected,
  },
  dropToFloor: {
    label: "바닥에 붙이기",
    shortcut: "dropToFloor",
    enabled: hasSelection,
    run: dropSelectedToFloor,
  },
  focus: {
    label: "선택 항목에 맞춰 보기",
    shortcut: "focus",
    enabled: hasSelection,
    run: focusSelected,
  },
  addMenu: {
    label: "검색해서 추가…",
    shortcut: "addMenu",
    enabled: always,
    run: ({ addMenu }) => addMenu.open(),
  },
  help: {
    label: "단축키",
    shortcut: "help",
    enabled: always,
    run: ({ help }) => help.setOpen(true),
  },
} as const satisfies Record<string, EditorCommand>;

export type CommandId = keyof typeof EDITOR_COMMANDS;

export function getCommand(id: CommandId): EditorCommand {
  return EDITOR_COMMANDS[id];
}
