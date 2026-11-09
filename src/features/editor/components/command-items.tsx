"use client";

import type { ReactNode } from "react";

import {
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { MenubarItem, MenubarShortcut } from "@/components/ui/menubar";

import {
  type CommandId,
  type CommandState,
  getCommand,
} from "../lib/editor-commands";
import type { EditorRuntime } from "../lib/editor-runtime";
import { getShortcutLabel } from "../lib/editor-shortcuts";

/*
 * 명령 표(editor-commands)의 한 줄을 메뉴 항목으로. 글자·단축키·활성 조건·동작이 모두 표에서 오므로
 * 메뉴바(MenubarCommandItem)와 우클릭 메뉴(DropdownCommandItem)는 id만 나열한다.
 */

type CommandItemProps = {
  id: CommandId;
  runtime: EditorRuntime | null;
  state: CommandState;
  /** 글자 앞에 붙일 아이콘 */
  children?: ReactNode;
};

function useCommandItem({ id, runtime, state }: CommandItemProps) {
  const command = getCommand(id);
  return {
    label: command.label,
    shortcut: command.shortcut && getShortcutLabel(command.shortcut),
    variant: command.variant,
    disabled: !runtime || !command.enabled(state),
    onClick: () => {
      if (runtime) command.run(runtime);
    },
  };
}

export function MenubarCommandItem(props: CommandItemProps) {
  const { label, shortcut, ...item } = useCommandItem(props);
  return (
    <MenubarItem {...item}>
      {props.children}
      {label}
      {shortcut && <MenubarShortcut>{shortcut}</MenubarShortcut>}
    </MenubarItem>
  );
}

export function DropdownCommandItem(props: CommandItemProps) {
  const { label, shortcut, ...item } = useCommandItem(props);
  return (
    <DropdownMenuItem {...item}>
      {props.children}
      {label}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}
