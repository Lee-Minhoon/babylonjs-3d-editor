"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useSceneFileState } from "../hooks/use-editor-state";
import type { EditorRuntime } from "./editor-viewport";

/** 새 씬·열기 전에 저장 안 된 변경을 버릴지 묻는다 (sceneFile.confirmPending) */
export function DiscardChangesDialog({
  runtime,
}: {
  runtime: EditorRuntime | null;
}) {
  const { confirmPending, fileName } = useSceneFileState(runtime);

  return (
    <AlertDialog
      open={confirmPending}
      // Esc·바깥 클릭·취소 버튼으로 닫히면 "버리지 않음"
      onOpenChange={(open) => {
        if (!open) runtime?.sceneFile.resolveConfirm(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            저장하지 않은 변경 사항이 있습니다
          </AlertDialogTitle>
          <AlertDialogDescription>
            {fileName ?? "제목 없음"}의 변경 사항을 버리고 계속할까요? 이 작업은
            실행 취소할 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => runtime?.sceneFile.resolveConfirm(true)}
          >
            변경 사항 버리기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
