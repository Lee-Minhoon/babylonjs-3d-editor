import {
  getPresetShortcut,
  getToolShortcut,
  SHORTCUT_LABELS,
  VIEW_SHORTCUTS,
} from "./editor-shortcuts";
import { MESH_PRESETS } from "./mesh-presets";
import type { TransformTool } from "./tools";

/*
 * 단축키 도움말 창(?)과 사용 설명서(/manual)가 함께 쓰는 단축키 목록.
 * 키 문자열은 메뉴·툴팁과 같은 곳(editor-shortcuts)에서 가져오므로, 단축키를 바꾸면 여기도 저절로 바뀐다.
 * 새 단축키를 SHORTCUT_LABELS에 넣으면 이 목록에도 넣어야 한다 (editor-reference.test가 확인).
 */

export type ShortcutEntry = {
  action: string;
  keys: readonly string[];
  note?: string;
};

export type ShortcutGroup = {
  title: string;
  items: readonly ShortcutEntry[];
};

/** 도구 이름 (툴바와 같은 순서) */
export const TOOL_LABELS: Record<TransformTool, string> = {
  select: "선택",
  move: "이동",
  rotate: "회전",
  scale: "크기",
};

const L = SHORTCUT_LABELS;

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "파일",
    items: [
      { action: "열기", keys: [L.open] },
      { action: "저장", keys: [L.save] },
      { action: "다른 이름으로 저장", keys: [L.saveAs] },
    ],
  },
  {
    title: "편집",
    items: [
      { action: "실행 취소", keys: [L.undo] },
      { action: "다시 실행", keys: [L.redo, "⌃Y"] },
      { action: "잘라내기", keys: [L.cut] },
      { action: "복사", keys: [L.copy] },
      { action: "붙여넣기", keys: [L.paste], note: "놓을 위치를 클릭" },
      { action: "복제", keys: [L.duplicate], note: "놓을 위치를 클릭" },
      { action: "이름 바꾸기", keys: [L.rename] },
      { action: "삭제", keys: [L.delete, "Delete"] },
    ],
  },
  {
    title: "선택",
    items: [
      {
        action: "전체 선택",
        keys: [L.selectAll],
        note: "숨기거나 잠근 메쉬 제외",
      },
      { action: "선택 해제 · 배치 끝내기", keys: [L.deselect] },
    ],
  },
  {
    title: "도구",
    items: (Object.keys(TOOL_LABELS) as TransformTool[]).map((tool) => ({
      action: TOOL_LABELS[tool],
      keys: [getToolShortcut(tool)],
    })),
  },
  {
    title: "메쉬 추가",
    items: [
      {
        action: "검색해서 추가",
        keys: [L.addMenu],
        note: "커서 위치에 검색창",
      },
      ...MESH_PRESETS.flatMap((preset) => {
        const key = getPresetShortcut(preset.id);
        return key ? [{ action: preset.label, keys: [key] }] : [];
      }),
      {
        action: "배치 미리보기 90° 회전",
        keys: [L.rotatePlacement, `⇧${L.rotatePlacement}`],
        note: "배치 중일 때만",
      },
    ],
  },
  {
    title: "객체",
    items: [
      { action: "숨기기", keys: [L.hide] },
      { action: "숨긴 메쉬 모두 보이기", keys: [L.showAll] },
      { action: "바닥에 붙이기", keys: [L.dropToFloor], note: "맥: fn+→" },
    ],
  },
  {
    title: "보기",
    items: [
      { action: "선택 항목에 맞춰 보기", keys: [L.focus] },
      {
        action: "정면 / 뒤",
        keys: [VIEW_SHORTCUTS.front, VIEW_SHORTCUTS.back],
      },
      {
        action: "오른쪽 / 왼쪽",
        keys: [VIEW_SHORTCUTS.right, VIEW_SHORTCUTS.left],
      },
      {
        action: "위 / 아래",
        keys: [VIEW_SHORTCUTS.top, VIEW_SHORTCUTS.bottom],
      },
      { action: "원근 ↔ 직교", keys: [L.orthographic] },
      { action: "단축키 도움말", keys: [L.help] },
    ],
  },
];
