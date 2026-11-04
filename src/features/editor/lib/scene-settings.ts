import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

import { createEditableProperty } from "./editable-property";

/*
 * 씬 환경 설정: 배경색 · 기본 조명 세기 · 환경광 세기 · 노출 · 톤 매핑. 씬 파일에 저장되고, 바꾸면 undo 대상이다.
 * 속성 패널은 아무것도 선택하지 않았을 때 이 설정을 보여준다.
 *
 * 값을 바꾸는 곳(미리보기·Command·새 씬·열기)은 모두 applySceneSettings를 거친다
 * → 패널은 onSceneSettingsChange 하나만 구독한다 (editable-property — 머티리얼과 같은 틀).
 * 노출·톤 매핑은 PBR 머티리얼에만 적용된다 — 배경색과 바닥 격자는 그대로다.
 */

export type ToneMapping = "none" | "standard" | "aces" | "neutral";

export type SceneSettings = {
  /** 배경색 (화면에 그대로 칠해진다), sRGB "#RRGGBB" */
  background: string;
  /** 씬 전체를 고르게 밝히는 기본 조명(반구광) 세기. 직접 놓은 조명을 돋보이게 하려면 낮춘다 */
  ambientIntensity: number;
  /** 환경(IBL) 반사·간접광 세기. 0이면 반사가 없다 */
  environmentIntensity: number;
  /** 노출 배율 (1 = 그대로) */
  exposure: number;
  toneMapping: ToneMapping;
};

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  background: "#1A1A1F",
  ambientIntensity: 1,
  environmentIntensity: 1,
  exposure: 1,
  // 톤 매핑을 끈 지금까지의 모습이 기본
  toneMapping: "none",
};

export const TONE_MAPPINGS = [
  { id: "none", label: "없음" },
  { id: "standard", label: "표준" },
  { id: "aces", label: "ACES" },
  { id: "neutral", label: "중립 (Khronos PBR Neutral)" },
] as const satisfies readonly { id: ToneMapping; label: string }[];

/** 기본 조명(반구광)의 이름. 뷰포트가 이 이름으로 만들고 ambientIntensity가 세기를 정한다 (에디터 객체가 아니다) */
export const AMBIENT_LIGHT_NAME = "__ambient-light";

/** 패널 슬라이더 범위. 파일은 0 이상이면 받는다 (손으로 고친 큰 값도 열린다) */
export const SETTING_RANGES = {
  ambientIntensity: { min: 0, max: 2, step: 0.05 },
  environmentIntensity: { min: 0, max: 3, step: 0.05 },
  exposure: { min: 0, max: 4, step: 0.05 },
} as const;

const TONE_MAPPING_TYPES: Record<Exclude<ToneMapping, "none">, number> = {
  standard: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  aces: ImageProcessingConfiguration.TONEMAPPING_ACES,
  neutral: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
};

/** 적용한 값 (색을 Color4에서 다시 계산하면 반올림이 어긋날 수 있어 그대로 기억한다) */
const appliedSettings = new WeakMap<Scene, SceneSettings>();

/** 씬의 환경 설정 속성 (대상은 Scene — 적용 전이면 기본값). 편집 한 번 = Command 하나("씬 설정") */
export const sceneSettingsProperty = createEditableProperty<
  Scene,
  SceneSettings
>({
  verb: "씬 설정",
  label: () => "씬 설정",
  read: (scene) => ({
    ...(appliedSettings.get(scene) ?? DEFAULT_SCENE_SETTINGS),
  }),
  write(scene, settings) {
    const { r, g, b } = Color3.FromHexString(settings.background);
    scene.clearColor = new Color4(r, g, b, 1);
    scene.environmentIntensity = settings.environmentIntensity;
    const ambient = scene.getLightByName(AMBIENT_LIGHT_NAME);
    if (ambient) ambient.intensity = settings.ambientIntensity;
    const imaging = scene.imageProcessingConfiguration;
    imaging.exposure = settings.exposure;
    imaging.toneMappingEnabled = settings.toneMapping !== "none";
    if (settings.toneMapping !== "none") {
      imaging.toneMappingType = TONE_MAPPING_TYPES[settings.toneMapping];
    }
    appliedSettings.set(scene, { ...settings });
  },
  isSame: (a, b) =>
    a.background.toLowerCase() === b.background.toLowerCase() &&
    a.ambientIntensity === b.ambientIntensity &&
    a.environmentIntensity === b.environmentIntensity &&
    a.exposure === b.exposure &&
    a.toneMapping === b.toneMapping,
});

/** 읽기는 늘 값이 있다 (적용 전이면 기본값) */
export const getSceneSettings = (scene: Scene): SceneSettings =>
  sceneSettingsProperty.get(scene)!;
export const {
  apply: applySceneSettings,
  onChange: onSceneSettingsChange,
  isSame: isSameSceneSettings,
  createCommand: createSceneSettingsCommand,
} = sceneSettingsProperty;
