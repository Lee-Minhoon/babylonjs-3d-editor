import { createListeners } from "@/lib/listeners";

import type { AddMenuAnchor } from "./add-menu";

/*
 * 우클릭 메뉴 (뷰포트·씬 목록). 열고 닫는 상태만 여기 두고, 항목은 context-menu-popup이 editor-actions로 만든다.
 *   - "selection": 객체를 우클릭 → 그 객체가 선택돼 있지 않으면 그것만 고른 뒤, 선택을 대상으로 한 메뉴
 *   - "scene":     빈 곳을 우클릭 → 붙여넣기·추가·전체 선택 등 (선택은 그대로)
 * 뷰포트는 우클릭 "탭"(거의 움직이지 않은 누름)에만 연다 — 오른쪽 드래그는 카메라 이동이고, 배치 중 우클릭은 배치 종료다
 * (pointer-router). 브라우저 기본 메뉴는 뷰포트·씬 목록에서 막는다.
 */

export type ContextMenuKind = "selection" | "scene";

export type ContextMenuState =
  | { open: false }
  | {
      open: true;
      kind: ContextMenuKind;
      /** 메뉴를 띄울 화면 좌표 (client 픽셀) */
      client: { x: number; y: number };
      /** 뷰포트에서 열었으면 캔버스 좌표 — "추가…"가 그 자리에 검색창을 띄운다. 씬 목록이면 null */
      canvas: AddMenuAnchor;
    };

export type ContextMenu = {
  open(
    kind: ContextMenuKind,
    client: { x: number; y: number },
    canvas?: AddMenuAnchor,
  ): void;
  close(): void;
  getState(): ContextMenuState;
  subscribe(onChange: () => void): () => void;
};

export function createContextMenu(): ContextMenu {
  let state: ContextMenuState = { open: false };
  const listeners = createListeners();
  return {
    open(kind, client, canvas = null) {
      state = { open: true, kind, client, canvas };
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
