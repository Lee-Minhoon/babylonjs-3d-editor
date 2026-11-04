"use client";

import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { useSceneMeshes } from "@/hooks/use-scene-meshes";

import {
  useClipboardHasContent,
  useContextMenuState,
  useSelection,
} from "../hooks/use-editor-state";
import { useMeshFlagCount } from "../hooks/use-mesh-flags";
import { useMeshHierarchy } from "../hooks/use-mesh-hierarchy";
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
} from "../lib/editor-actions";
import type { EditorRuntime } from "../lib/editor-runtime";
import { SHORTCUT_LABELS } from "../lib/editor-shortcuts";
import { inCreationOrder } from "../lib/mesh-presets";

function Item({
  shortcut,
  children,
  ...props
}: {
  shortcut?: string;
  children: ReactNode;
  disabled?: boolean;
  variant?: "default" | "destructive";
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem {...props}>
      {children}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}

/** 객체를 우클릭했을 때: 선택한 객체들을 대상으로 (메뉴바 편집·객체 메뉴와 같은 동작) */
function SelectionItems({ runtime }: { runtime: EditorRuntime }) {
  const selected = useSelection(runtime);
  const canPaste = useClipboardHasContent(runtime);
  const lockedCount = useMeshFlagCount(selected, "locked");
  const hierarchy = useMeshHierarchy();
  const hasParent = selected.some((mesh) => hierarchy.getParent(mesh));
  const count = selected.length;

  return (
    <>
      <Item
        shortcut={SHORTCUT_LABELS.rename}
        disabled={count !== 1}
        onClick={() => startRename(runtime)}
      >
        이름 바꾸기
      </Item>
      <DropdownMenuSeparator />
      <Item shortcut={SHORTCUT_LABELS.cut} onClick={() => cutSelected(runtime)}>
        잘라내기
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.copy}
        onClick={() => copySelected(runtime)}
      >
        복사
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.paste}
        disabled={!canPaste}
        onClick={() => paste(runtime)}
      >
        붙여넣기
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.duplicate}
        onClick={() => duplicateSelected(runtime)}
      >
        복제
      </Item>
      <DropdownMenuSeparator />
      <Item
        shortcut={SHORTCUT_LABELS.hide}
        onClick={() => hideSelected(runtime)}
      >
        숨기기
      </Item>
      {lockedCount === count ? (
        <Item onClick={() => setSelectedLocked(runtime, false)}>잠금 풀기</Item>
      ) : (
        <Item onClick={() => setSelectedLocked(runtime, true)}>잠그기</Item>
      )}
      <DropdownMenuSeparator />
      <Item
        shortcut={SHORTCUT_LABELS.parent}
        disabled={count < 2}
        onClick={() => parentSelected(runtime)}
      >
        부모 지정 (마지막에 고른 것)
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.unparent}
        disabled={!hasParent}
        onClick={() => unparentSelected(runtime)}
      >
        부모 해제
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.dropToFloor}
        onClick={() => dropSelectedToFloor(runtime)}
      >
        바닥에 붙이기
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.focus}
        onClick={() => focusSelected(runtime)}
      >
        선택 항목에 맞춰 보기
      </Item>
      <DropdownMenuSeparator />
      <Item
        shortcut={SHORTCUT_LABELS.delete}
        variant="destructive"
        onClick={() => deleteSelected(runtime)}
      >
        삭제
      </Item>
    </>
  );
}

/** 빈 곳을 우클릭했을 때: 씬 전체에 하는 동작 */
function SceneItems({
  runtime,
  canvas,
}: {
  runtime: EditorRuntime;
  canvas: { x: number; y: number } | null;
}) {
  const canPaste = useClipboardHasContent(runtime);
  const meshes = inCreationOrder(useSceneMeshes(runtime.scene));
  const hiddenCount = useMeshFlagCount(meshes, "hidden");

  return (
    <>
      <Item
        shortcut={SHORTCUT_LABELS.addMenu}
        onClick={() => runtime.addMenu.open(canvas)}
      >
        추가…
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.paste}
        disabled={!canPaste}
        onClick={() => paste(runtime)}
      >
        붙여넣기
      </Item>
      <DropdownMenuSeparator />
      <Item
        shortcut={SHORTCUT_LABELS.selectAll}
        disabled={meshes.length === 0}
        onClick={() => runtime.selection.selectAll()}
      >
        전체 선택
      </Item>
      <Item
        shortcut={SHORTCUT_LABELS.showAll}
        disabled={hiddenCount === 0}
        onClick={() => showAllHidden(runtime)}
      >
        숨긴 메쉬 모두 보이기
      </Item>
    </>
  );
}

/**
 * 우클릭 메뉴 (뷰포트·씬 목록). 연 자리(커서)에 붙는다 — 트리거 없이 가상 기준점으로 띄운다.
 * 항목을 고르거나 Esc·바깥 클릭으로 닫힌다.
 */
export function ContextMenuPopup({ runtime }: { runtime: EditorRuntime }) {
  const state = useContextMenuState(runtime);
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
          <SelectionItems runtime={runtime} />
        ) : (
          <SceneItems runtime={runtime} canvas={state.canvas} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
