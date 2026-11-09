"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";

import { useCommandState } from "../hooks/use-command-state";
import { useContextMenuState } from "../hooks/use-editor-state";
import type { CommandState } from "../lib/editor-commands";
import type { EditorRuntime } from "../lib/editor-runtime";
import { SHORTCUT_LABELS } from "../lib/editor-shortcuts";
import { DropdownCommandItem } from "./command-items";

type ItemsProps = { runtime: EditorRuntime; state: CommandState };

/** 객체를 우클릭했을 때: 선택한 객체들을 대상으로 (메뉴바 편집·객체 메뉴와 같은 명령 표) */
function SelectionItems({ runtime, state }: ItemsProps) {
  const item = { runtime, state };
  // 잠그기/잠금 풀기는 하나만 — 모두 잠겨 있으면 풀기
  const lockToggle =
    state.lockedCount === state.selectionCount ? "unlock" : "lock";
  return (
    <>
      <DropdownCommandItem id="rename" {...item} />
      <DropdownMenuSeparator />
      <DropdownCommandItem id="cut" {...item} />
      <DropdownCommandItem id="copy" {...item} />
      <DropdownCommandItem id="paste" {...item} />
      <DropdownCommandItem id="duplicate" {...item} />
      <DropdownMenuSeparator />
      <DropdownCommandItem id="hide" {...item} />
      <DropdownCommandItem id={lockToggle} {...item} />
      <DropdownMenuSeparator />
      <DropdownCommandItem id="parent" {...item} />
      <DropdownCommandItem id="unparent" {...item} />
      <DropdownCommandItem id="dropToFloor" {...item} />
      <DropdownCommandItem id="focus" {...item} />
      <DropdownMenuSeparator />
      <DropdownCommandItem id="delete" {...item} />
    </>
  );
}

/** 빈 곳을 우클릭했을 때: 씬 전체에 하는 동작. "추가…"는 우클릭한 캔버스 자리에 검색창을 띄운다 */
function SceneItems({
  runtime,
  state,
  canvas,
}: ItemsProps & { canvas: { x: number; y: number } | null }) {
  const item = { runtime, state };
  return (
    <>
      <DropdownMenuItem onClick={() => runtime.addMenu.open(canvas)}>
        추가…
        <DropdownMenuShortcut>{SHORTCUT_LABELS.addMenu}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownCommandItem id="paste" {...item} />
      <DropdownMenuSeparator />
      <DropdownCommandItem id="selectAll" {...item} />
      <DropdownCommandItem id="showAll" {...item} />
    </>
  );
}

/**
 * 우클릭 메뉴 (뷰포트·씬 목록). 연 자리(커서)에 붙는다 — 트리거 없이 가상 기준점으로 띄운다.
 * 항목을 고르거나 Esc·바깥 클릭으로 닫힌다.
 */
export function ContextMenuPopup({ runtime }: { runtime: EditorRuntime }) {
  const state = useContextMenuState(runtime);
  const commands = useCommandState(runtime);
  if (!state.open) return null;
  const { x, y } = state.client;
  const anchor = {
    getBoundingClientRect: () =>
      DOMRect.fromRect({ x, y, width: 0, height: 0 }),
  };

  return (
    <DropdownMenu
      // 열 때마다 새로 (다른 자리에서 다시 열면 그 자리로)
      key={`${x},${y},${state.kind}`}
      open
      onOpenChange={(open) => {
        if (!open) runtime.contextMenu.close();
      }}
    >
      <DropdownMenuContent
        anchor={anchor}
        // 닫힐 때 포커스를 되돌리지 않는다 — 돌려줄 트리거가 없고, "추가…"·"이름 바꾸기"가 옮긴 포커스를 뺏으면
        // 검색창이 바로 닫히거나 이름 칸에서 빠진다
        finalFocus={false}
        sideOffset={0}
        className="w-auto min-w-56"
        aria-label={state.kind === "selection" ? "선택 메뉴" : "씬 메뉴"}
      >
        {state.kind === "selection" ? (
          <SelectionItems runtime={runtime} state={commands} />
        ) : (
          <SceneItems
            runtime={runtime}
            state={commands}
            canvas={state.canvas}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
