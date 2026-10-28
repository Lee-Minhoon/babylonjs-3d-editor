"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { useAutosaveState } from "../hooks/use-editor-state";
import type { EditorRuntime } from "./editor-viewport";

const SAVED_AT = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** 시작할 때 자동 저장 기록이 있으면 복구할지 묻는다 (autosave.pending) */
export function RecoveryDialog({ runtime }: { runtime: EditorRuntime | null }) {
  const { pending } = useAutosaveState(runtime);

  return (
    <AlertDialog
      open={pending !== null}
      // Esc로 닫으면 복구 — 실수로 눌러도 작업을 잃지 않게
      onOpenChange={(open) => {
        if (!open) runtime?.autosave.recover();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>저장하지 않은 작업이 있습니다</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.fileName ?? "제목 없음"} ·{" "}
            {pending && SAVED_AT.format(pending.savedAt)}에 자동 저장됨.
            복구하지 않으면 이 기록은 지워집니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => runtime?.autosave.discard()}>
            버리기
          </Button>
          <AlertDialogAction onClick={() => runtime?.autosave.recover()}>
            복구
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
