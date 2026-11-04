"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { type AddMenu, type AddMenuItem, searchAddMenu } from "../lib/add-menu";
import { startPresetPlacement } from "../lib/editor-actions";
import type { EditorRuntime } from "../lib/editor-runtime";
import { getPresetShortcut } from "../lib/editor-shortcuts";
import { PRESET_ICONS } from "./preset-icons";

const WIDTH = 240;
/** 뷰포트 가장자리와의 최소 간격 */
const MARGIN = 8;

function useAddMenuState(addMenu: AddMenu) {
  return useSyncExternalStore(
    addMenu.subscribe,
    addMenu.getState,
    addMenu.getState,
  );
}

/**
 * 검색형 추가 메뉴 (⇧A): 커서 자리에 검색창과 목록을 띄운다. 글자를 치면 거르고, ↑↓로 고르고 Enter(또는 클릭)로
 * 배치를 시작한다. Esc·바깥 클릭으로 닫힌다. 뷰포트(relative) 안에 겹쳐 그린다.
 */
export function AddMenuPopup({ runtime }: { runtime: EditorRuntime }) {
  const state = useAddMenuState(runtime.addMenu);
  if (!state.open) return null;
  // key: 열 때마다 검색어·고른 항목을 처음부터
  return (
    <AddMenuPanel
      key={JSON.stringify(state.at)}
      runtime={runtime}
      at={state.at}
    />
  );
}

function AddMenuPanel({
  runtime,
  at,
}: {
  runtime: EditorRuntime;
  at: { x: number; y: number } | null;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const items = searchAddMenu(query);
  const activeIndex = Math.min(active, items.length - 1);

  // 뷰포트 밖으로 나가지 않게 (커서가 오른쪽·아래 끝이면 안쪽으로)
  useLayoutEffect(() => {
    const element = panel.current;
    const parent = element?.offsetParent;
    if (!element || !(parent instanceof HTMLElement)) return;
    const { clientWidth, clientHeight } = parent;
    const height = element.offsetHeight;
    const x = at?.x ?? (clientWidth - WIDTH) / 2;
    const y = at?.y ?? clientHeight / 3;
    setPosition({
      left: Math.max(MARGIN, Math.min(x, clientWidth - WIDTH - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, clientHeight - height - MARGIN)),
    });
  }, [at]);

  const close = () => runtime.addMenu.close();
  const choose = (item: AddMenuItem | undefined) => {
    if (!item) return;
    close();
    startPresetPlacement(runtime.placement, item.preset);
  };

  const listId = "add-menu-list";
  const optionId = (index: number) => `add-menu-option-${index}`;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="추가"
      data-open=""
      className={cn(
        "absolute z-20 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg",
        // 자리를 재기 전엔 투명하게 (invisible은 포커스를 못 받아 autoFocus가 안 된다)
        !position && "opacity-0",
      )}
      style={{ width: WIDTH, ...position }}
      // 바깥을 누르면 닫는다 (포커스가 패널 밖으로 나가면)
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <Input
        autoFocus
        role="combobox"
        aria-label="추가할 것 검색"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={
          items.length > 0 ? optionId(activeIndex) : undefined
        }
        placeholder="검색… (Box, 원기둥 …)"
        className="h-8 rounded-none border-0 border-b focus-visible:ring-0"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          // 한글 조합 중의 Enter·화살표는 입력기 몫
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(items[activeIndex]);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (items.length === 0) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + items.length) % items.length);
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="추가할 것"
        className="max-h-64 overflow-y-auto p-1"
      >
        {items.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-muted-foreground">
            찾는 항목이 없습니다
          </li>
        )}
        {items.map((item, index) => {
          const Icon = PRESET_ICONS[item.preset.id];
          const shortcut = getPresetShortcut(item.preset.id);
          return (
            <li
              key={item.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
              onPointerMove={() => setActive(index)}
              // 입력창의 포커스를 지킨다 (누르는 순간 blur로 닫히지 않게)
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <Icon strokeWidth={1.75} aria-hidden className="size-3.5" />
              <span className="flex-1">{item.label}</span>
              <span className="text-muted-foreground">{item.kind}</span>
              {shortcut && <Kbd>{shortcut}</Kbd>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
