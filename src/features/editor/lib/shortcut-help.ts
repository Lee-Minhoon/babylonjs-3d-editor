import { createListeners } from "@/lib/listeners";

/** 단축키 도움말 창 열림 상태 (? 키·도움말 메뉴가 열고, 창이 닫는다) */
export type ShortcutHelp = {
  isOpen(): boolean;
  setOpen(open: boolean): void;
  subscribe(onChange: () => void): () => void;
};

export function createShortcutHelp(): ShortcutHelp {
  let open = false;
  const listeners = createListeners();
  return {
    isOpen: () => open,
    setOpen(next) {
      if (next === open) return;
      open = next;
      listeners.emit();
    },
    subscribe: listeners.subscribe,
  };
}
