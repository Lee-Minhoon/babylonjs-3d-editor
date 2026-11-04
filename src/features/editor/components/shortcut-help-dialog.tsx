"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { EditorRuntime } from "../lib/editor-runtime";
import { MouseControlsTable, ShortcutGroups } from "./shortcut-reference";

const subscribeNoop = () => () => {};
const getFalse = () => false;

/** 단축키 도움말 창 (? · 도움말 메뉴). 전체 설명은 /manual */
export function ShortcutHelpDialog({
  runtime,
}: {
  runtime: EditorRuntime | null;
}) {
  const help = runtime?.help;
  const open = useSyncExternalStore(
    help?.subscribe ?? subscribeNoop,
    help?.isOpen ?? getFalse,
    getFalse,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => help?.setOpen(next)}>
      <DialogContent className="max-h-[85dvh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>단축키</DialogTitle>
          <DialogDescription>
            ⌘는 Windows에서 Ctrl, ⌥는 Alt입니다.{" "}
            <Link
              href="/manual"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
            >
              사용 설명서 열기
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          </DialogDescription>
        </DialogHeader>
        {/* 그리드 칸은 내용만큼 늘어나므로 높이를 직접 정해야 스크롤된다 */}
        <ScrollArea className="-mr-4 h-[calc(85dvh-7rem)] pr-4">
          <ShortcutGroups />
          <h3 className="mt-6 mb-1.5 text-xs font-semibold text-muted-foreground">
            마우스
          </h3>
          <MouseControlsTable />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
