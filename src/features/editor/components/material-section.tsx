"use client";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

import { usePropertyValues } from "../hooks/use-property";
import { usePropertyEdit } from "../hooks/use-property-edit";
import type { Asset } from "../lib/asset-store";
import type { History } from "../lib/history";
import type { MaterialLibrary } from "../lib/material-library";
import {
  materialProperty,
  type MaterialValues,
  TEXTURE_SLOTS,
  UV_SCALE_RANGE,
} from "../lib/mesh-material";
import { SharedMaterialField } from "./shared-material-field";
import {
  ColorField,
  FieldLabel,
  MIXED_LABEL,
  sharedValue,
  SliderField,
} from "./value-fields";

/** 텍스처 칸 셀렉트의 특별한 값 */
const NO_TEXTURE = "";
const MIXED_TEXTURE = "mixed";
const IMPORT_TEXTURE = "import";

/**
 * 머티리얼 편집 (PBR 기본색·메탈릭·거칠기·발광색·불투명도·조명 무시). 여러 메쉬면 함께 편집한다.
 * 속성 패널 숫자 입력과 같은 원칙: 색을 고르는 중·슬라이더를 끄는 중에는 메쉬에 바로 적용(미리보기)하고,
 * 커밋(색상 창 닫기·슬라이더 놓기·hex Enter·스위치)에서 편집 시작 전 값과 비교해 Command 하나로 기록한다.
 * 여러 메쉬면 바꾼 항목만 모두에 넣고(나머지는 각자 값 유지), 달라진 메쉬들을 Command 하나로 묶는다.
 * 값이 서로 다른 항목은 "—"로 보인다.
 * 텍스처 칸은 가져온 이미지 중에서 고르거나 새로 가져온다 (가져오면 바로 그 칸에 들어간다).
 * 맨 위 "공유 머티리얼"로 라이브러리 머티리얼에 연결하면 아래 값은 그 머티리얼을 쓰는 메쉬 모두에 적용된다.
 */
export function MaterialSection({
  meshes,
  history,
  library,
  images,
  onImportImage,
}: {
  meshes: readonly AbstractMesh[];
  history: History;
  library: MaterialLibrary;
  /** 에셋 저장소의 이미지들 (텍스처 칸 목록) */
  images: readonly Asset[];
  /** 이미지 파일을 골라 가져온다 (취소·실패면 null) */
  onImportImage: () => Promise<Asset | null>;
}) {
  const materials = usePropertyValues(materialProperty, meshes);
  const { preview, commit, cancel, onKeyDown } = usePropertyEdit(
    materialProperty,
    meshes,
    history,
  );

  if (materials.length === 0) return null;
  const field = <K extends keyof MaterialValues>(key: K) =>
    sharedValue(materials, (values) => values[key]);
  const color = field("color");
  const emissive = field("emissive");
  const unlit = field("unlit");
  // 조명 무시면 메탈릭·거칠기는 쓰이지 않는다 (기본색·발광색·불투명도만)
  const lit = !unlit.value && !unlit.mixed;
  const textured = TEXTURE_SLOTS.some(({ key }) => {
    const { value, mixed } = field(key);
    return value !== null || mixed;
  });

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <SharedMaterialField
        meshes={meshes}
        library={library}
        history={history}
      />
      <ColorField
        label="기본색"
        {...color}
        history={history}
        onPreview={(next) => preview({ color: next })}
        onCommit={commit}
        onCancel={cancel}
      />
      {(["metallic", "roughness"] as const).map((key) => (
        <SliderField
          key={key}
          label={key === "metallic" ? "메탈릭" : "거칠기"}
          {...field(key)}
          disabled={!lit}
          onPreview={(value) => preview({ [key]: value })}
          onCommit={commit}
        />
      ))}
      <ColorField
        label="발광색"
        {...emissive}
        history={history}
        onPreview={(next) => preview({ emissive: next })}
        onCommit={commit}
        onCancel={cancel}
      />
      <SliderField
        label="불투명도"
        {...field("alpha")}
        onPreview={(alpha) => preview({ alpha })}
        onCommit={commit}
      />
      {TEXTURE_SLOTS.map(({ key, label }) => {
        const { value, mixed } = field(key);
        return (
          <div key={key}>
            <FieldLabel>{label}</FieldLabel>
            <NativeSelect
              aria-label={label}
              className="w-full"
              value={mixed ? MIXED_TEXTURE : (value ?? NO_TEXTURE)}
              onChange={async (event) => {
                const choice = event.target.value;
                let id: string | null = choice === NO_TEXTURE ? null : choice;
                if (choice === IMPORT_TEXTURE) {
                  const imported = await onImportImage();
                  if (!imported) return;
                  id = imported.id;
                }
                // 처음 기본색 맵을 넣으면 기본색을 흰색으로 — 이미지가 색에 곱해지므로 그대로 보이게
                const plain =
                  key === "colorMap" && value === null && !mixed && id
                    ? { color: "#FFFFFF" }
                    : {};
                preview({ [key]: id, ...plain });
                commit();
              }}
            >
              {mixed && (
                <NativeSelectOption value={MIXED_TEXTURE} disabled>
                  {MIXED_LABEL}
                </NativeSelectOption>
              )}
              <NativeSelectOption value={NO_TEXTURE}>없음</NativeSelectOption>
              {images.map((image) => (
                <NativeSelectOption key={image.id} value={image.id}>
                  {image.name}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={IMPORT_TEXTURE}>
                이미지 가져오기…
              </NativeSelectOption>
            </NativeSelect>
          </div>
        );
      })}
      {textured && (
        <SliderField
          label="텍스처 반복"
          {...field("uvScale")}
          {...UV_SCALE_RANGE}
          digits={1}
          onPreview={(uvScale) => preview({ uvScale })}
          onCommit={commit}
        />
      )}
      <label className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        <span>
          조명 무시
          {unlit.mixed && <span className="ml-1.5">{MIXED_LABEL}</span>}
        </span>
        <Switch
          size="sm"
          checked={unlit.value && !unlit.mixed}
          onCheckedChange={(next) => {
            preview({ unlit: next });
            commit();
          }}
        />
      </label>
    </div>
  );
}
