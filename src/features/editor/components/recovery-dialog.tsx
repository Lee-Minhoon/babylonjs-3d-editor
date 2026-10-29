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

import { useAutosaveState, useSceneFileState } from "../hooks/use-editor-state";
import type { EditorRuntime } from "./editor-viewport";

const SAVED_AT = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * 시작할 때 자동 저장 기록이 있으면 복구할지 묻는다 (autosave.pending).
 * 기록을 읽는 사이 이미 편집을 시작했을 수 있다 — 그러면 복구가 그 편집을 지운다고 알리고,
 * Esc가 복구로 이어지지 않게 한다.
 */
export function RecoveryDialog({ runtime }: { runtime: EditorRuntime | null }) {
  const { pending } = useAutosaveState(runtime);
  const { dirty: editedMeanwhile } = useSceneFileState(runtime);

  return (
    <AlertDialog
      open={pending !== null}
      // Esc로 닫으면 복구 — 실수로 눌러도 작업을 잃지 않게. 이미 편집한 게 있으면 버튼으로만 고른다
      onOpenChange={(open) => {
        if (!open && !editedMeanwhile) runtime?.autosave.recover();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>저장하지 않은 작업이 있습니다</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.fileName ?? "제목 없음"} ·{" "}
            {pending && SAVED_AT.format(pending.savedAt)}에 자동 저장됨.
            복구하지 않으면 이 기록은 지워집니다.
            {editedMeanwhile &&
              " 복구하면 지금 씬에서 방금 편집한 내용은 사라집니다."}
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
