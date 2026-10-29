"use client";

import type { ComponentProps } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Input } from "@/components/ui/input";

import { useMeshName } from "../hooks/use-mesh-name";
import { renameMesh } from "../lib/editor-actions";
import { getShortcutKey, handleFieldHistoryKey } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";

type MeshNameInputProps = {
  mesh: AbstractMesh;
  history: History;
  /** 편집이 끝나면(확정·취소 모두) 호출 — 씬 목록의 인라인 편집을 닫는다 */
  onDone?: () => void;
} & Pick<ComponentProps<"input">, "id" | "autoFocus" | "className">;

/**
 * 메쉬 이름 입력칸. Enter·blur로 확정(Command 하나), Esc는 취소. 빈 이름은 원래대로.
 * 다른 숫자 입력칸과 같이 ⌘Z/⌘⇧Z는 편집 중이면 그 편집만 취소하고, 아니면 히스토리 undo/redo.
 */
export function MeshNameInput({
  mesh,
  history,
  onDone,
  ...props
}: MeshNameInputProps) {
  const name = useMeshName(mesh);

  return (
    <Input
      // key: 이름이 밖에서 바뀌면(undo 등) 입력 중이던 글자를 버리고 새 이름을 보인다
      key={name}
      aria-label="메쉬 이름"
      defaultValue={name}
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        // 한글 조합 중의 Enter는 글자 확정용이다 — 여기서 끝내면 마지막 글자가 잘리거나 겹친다
        if (event.nativeEvent.isComposing) return;
        const input = event.currentTarget;
        const key = getShortcutKey(event);
        if (key === "enter") {
          input.blur();
        } else if (key === "escape") {
          input.value = name;
          input.blur();
        } else {
          handleFieldHistoryKey(event, history, () => {
            if (input.value === name) return false;
            input.value = name;
            return true;
          });
        }
      }}
      onBlur={(event) => {
        if (!renameMesh({ history }, mesh, event.currentTarget.value)) {
          // 그대로이거나 빈 이름 → 원래 이름으로
          event.currentTarget.value = name;
        }
        onDone?.();
      }}
      {...props}
    />
  );
}
