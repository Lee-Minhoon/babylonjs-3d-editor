"use client";

import { useSyncExternalStore } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

import { usePropertyValues } from "../hooks/use-property";
import { getShortcutKey, handleFieldHistoryKey } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
import {
  createLinkCommand,
  createRenameMaterialCommand,
  createSharedMaterialCommand,
  createUnlinkCommand,
  getMaterialLibraryId,
  type MaterialLibrary,
  materialSlotProperty,
} from "../lib/material-library";
import { FieldLabel, MIXED_LABEL, sharedValue } from "./value-fields";

const OWN = "";
const MIXED = "mixed";
const NEW = "new";

/**
 * 공유 머티리얼 고르기 (머티리얼 칸 맨 위). "전용"·라이브러리 항목·"새 공유 머티리얼로 만들기".
 * 고르면 바로 Command 하나 (연결·연결 해제·만들기). 연결된 머티리얼이면 이름을 바꿀 수 있다.
 */
export function SharedMaterialField({
  meshes,
  library,
  history,
}: {
  meshes: readonly AbstractMesh[];
  library: MaterialLibrary;
  history: History;
}) {
  const entries = useSyncExternalStore(
    library.subscribe,
    library.getEntries,
    library.getEntries,
  );
  const materials = usePropertyValues(materialSlotProperty, meshes);
  if (materials.length === 0) return null;
  const { value: id, mixed } = sharedValue(materials, getMaterialLibraryId);
  const linked = mixed ? undefined : entries.find((entry) => entry.id === id);

  return (
    <div className="space-y-1.5">
      <FieldLabel>공유 머티리얼</FieldLabel>
      <NativeSelect
        aria-label="공유 머티리얼"
        className="w-full"
        value={mixed ? MIXED : (id ?? OWN)}
        onChange={(event) => {
          const choice = event.target.value;
          const command =
            choice === OWN
              ? createUnlinkCommand(meshes)
              : choice === NEW
                ? createSharedMaterialCommand(library, meshes)
                : createLinkCommand(meshes, library.find(choice)!);
          if (command) history.execute(command);
        }}
      >
        {mixed && (
          <NativeSelectOption value={MIXED} disabled>
            {MIXED_LABEL}
          </NativeSelectOption>
        )}
        <NativeSelectOption value={OWN}>
          공유 안 함 (이 메쉬 전용)
        </NativeSelectOption>
        {entries.map((entry) => (
          <NativeSelectOption key={entry.id} value={entry.id}>
            {entry.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={NEW}>
          새 공유 머티리얼로 만들기
        </NativeSelectOption>
      </NativeSelect>
      {linked && (
        <>
          <Input
            // key: 이름이 밖에서 바뀌면(undo 등) 입력 중이던 글자를 버린다
            key={`${linked.id}:${linked.name}`}
            aria-label="공유 머티리얼 이름"
            defaultValue={linked.name}
            spellCheck={false}
            className="h-7"
            onKeyDown={(event) => {
              // 한글 조합 중의 Enter는 글자 확정용
              if (event.nativeEvent.isComposing) return;
              const input = event.currentTarget;
              const key = getShortcutKey(event);
              if (key === "enter") {
                input.blur();
              } else if (key === "escape") {
                input.value = linked.name;
                input.blur();
              } else {
                handleFieldHistoryKey(event, history, () => {
                  if (input.value === linked.name) return false;
                  input.value = linked.name;
                  return true;
                });
              }
            }}
            onBlur={(event) => {
              const command = createRenameMaterialCommand(
                library,
                linked.id,
                event.currentTarget.value,
              );
              if (command) history.execute(command);
              else event.currentTarget.value = linked.name;
            }}
          />
          <p className="text-muted-foreground">
            이 머티리얼을 쓰는 메쉬가 모두 함께 바뀝니다.
          </p>
        </>
      )}
    </div>
  );
}
