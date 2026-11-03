import { createListeners } from "@/lib/listeners";

import { ALL_PRESETS, type MeshPreset } from "./mesh-presets";

/*
 * 검색형 추가 메뉴 (⇧A, Blender 방식): 커서 위치에 검색창을 띄워 추가할 것을 고른다.
 * 메쉬·조명 프리셋 — 가져온 모델이 생기면 ADD_MENU_ITEMS에 더한다.
 * 고르면 배치 모드가 시작된다 (startPresetPlacement).
 */

export type AddMenuItem = {
  id: string;
  label: string;
  /** 무엇인지 (목록 오른쪽에 흐리게) */
  kind: string;
  keywords: readonly string[];
  preset: MeshPreset;
};

export const ADD_MENU_ITEMS: readonly AddMenuItem[] = ALL_PRESETS.map(
  (preset) => ({
    id: preset.id,
    label: preset.label,
    kind: preset.light ? "조명" : "메쉬",
    keywords: preset.light
      ? [...preset.keywords, "조명", "light"]
      : preset.keywords,
    preset,
  }),
);

/**
 * 검색: 이름·검색어(한글 이름 등)에 글자가 들어 있으면 보인다. 대소문자·공백 무시.
 * 이름이 그 글자로 시작하는 것 → 검색어가 시작하는 것 → 들어 있기만 한 것 순 (같으면 원래 순서).
 */
export function searchAddMenu(
  query: string,
  items: readonly AddMenuItem[] = ADD_MENU_ITEMS,
): AddMenuItem[] {
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, "");
  const q = normalize(query);
  if (!q) return [...items];
  const rank = (item: AddMenuItem) => {
    const label = normalize(item.label);
    const words = [item.id, ...item.keywords].map(normalize);
    if (label.startsWith(q)) return 0;
    if (words.some((word) => word.startsWith(q))) return 1;
    if (label.includes(q) || words.some((word) => word.includes(q))) return 2;
    return null;
  };
  return items
    .map((item) => ({ item, rank: rank(item) }))
    .filter(
      (entry): entry is { item: AddMenuItem; rank: number } =>
        entry.rank !== null,
    )
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ item }) => item);
}

/** 메뉴를 띄울 곳: 캔버스 기준 CSS 픽셀. null이면 뷰포트 가운데 */
export type AddMenuAnchor = { x: number; y: number } | null;

export type AddMenuState = { open: false } | { open: true; at: AddMenuAnchor };

export type AddMenu = {
  open(at?: AddMenuAnchor): void;
  close(): void;
  getState(): AddMenuState;
  subscribe(onChange: () => void): () => void;
};

export function createAddMenu(): AddMenu {
  let state: AddMenuState = { open: false };
  const listeners = createListeners();
  return {
    open(at = null) {
      state = { open: true, at };
      listeners.emit();
    },
    close() {
      if (!state.open) return;
      state = { open: false };
      listeners.emit();
    },
    getState: () => state,
    subscribe: listeners.subscribe,
  };
}
