"use client";

import type { Scene } from "@babylonjs/core/scene";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

import { usePreviewEdit } from "../hooks/use-preview-edit";
import { useSceneSettings } from "../hooks/use-scene-settings";
import { handleFieldHistoryKey, isTypingTarget } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
import {
  applySceneSettings,
  createSceneSettingsCommand,
  getSceneSettings,
  isSameSceneSettings,
  SETTING_RANGES,
  TONE_MAPPINGS,
  type ToneMapping,
} from "../lib/scene-settings";
import { ColorField, FieldLabel, SliderField } from "./value-fields";

/** 씬 환경 설정 (선택이 없을 때 속성 패널). 편집 원칙은 머티리얼과 같다 — 미리보기 후 커밋에서 Command 하나 */
export function SceneSettingsSection({
  scene,
  history,
}: {
  scene: Scene;
  history: History;
}) {
  const settings = useSceneSettings(scene);
  const { preview, commit, cancel } = usePreviewEdit({
    targets: [scene],
    get: getSceneSettings,
    apply: applySceneSettings,
    isSame: isSameSceneSettings,
    record: ([{ before, after }]) =>
      history.execute(createSceneSettingsCommand(scene, before, after)),
  });

  return (
    <div
      className="space-y-3"
      // 입력창·슬라이더·셀렉트는 editor-shortcuts가 건너뛰므로 undo/redo를 여기서 처리한다
      onKeyDown={(event) => {
        if (isTypingTarget(event.target)) {
          handleFieldHistoryKey(event, history, cancel);
        }
      }}
    >
      <ColorField
        label="배경색"
        value={settings.background}
        history={history}
        onPreview={(background) => preview({ background })}
        onCommit={commit}
        onCancel={cancel}
      />
      <SliderField
        label="기본 조명 세기"
        value={settings.ambientIntensity}
        {...SETTING_RANGES.ambientIntensity}
        onPreview={(ambientIntensity) => preview({ ambientIntensity })}
        onCommit={commit}
      />
      <SliderField
        label="환경광 세기"
        value={settings.environmentIntensity}
        {...SETTING_RANGES.environmentIntensity}
        onPreview={(environmentIntensity) => preview({ environmentIntensity })}
        onCommit={commit}
      />
      <SliderField
        label="노출"
        value={settings.exposure}
        {...SETTING_RANGES.exposure}
        onPreview={(exposure) => preview({ exposure })}
        onCommit={commit}
      />
      <div>
        <FieldLabel>톤 매핑</FieldLabel>
        <NativeSelect
          aria-label="톤 매핑"
          className="w-full"
          value={settings.toneMapping}
          onChange={(event) => {
            preview({ toneMapping: event.target.value as ToneMapping });
            commit();
          }}
        >
          {TONE_MAPPINGS.map(({ id, label }) => (
            <NativeSelectOption key={id} value={id}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
