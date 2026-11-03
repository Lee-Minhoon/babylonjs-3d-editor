// 씬에 그림자 생성기 렌더링을 등록한다 (없으면 그림자가 그려지지 않는다)
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowLight } from "@babylonjs/core/Lights/shadowLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { ShadowOnlyMaterial } from "@babylonjs/materials/shadowOnly/shadowOnlyMaterial";

import { createKeyedListeners } from "@/lib/listeners";

import type { Command } from "./history";
import { getMeshFlag, onMeshFlagChange } from "./mesh-flags";
import type { MaterialValues } from "./mesh-material";
import {
  addPresetMesh,
  findPreset,
  getPresetId,
  inCreationOrder,
  isLightObject,
  type LightKind,
  type MeshPreset,
  type ShapeParams,
} from "./mesh-presets";

/*
 * 에디터 조명 (방향광·점광원·스포트). 조명마다 뷰포트에 작은 아이콘 메쉬를 두고 실제 Babylon 조명을 그 자식으로 붙인다
 * → 선택·기즈모(이동·회전)·이름·숨기기·잠금·삭제·undo·씬 목록이 메쉬와 같은 경로로 동작한다.
 * 아이콘은 그림자를 드리우지 않고, 스크린샷·glTF·배치 표면·바닥에 붙이기 대상에서 빠진다 (isLightObject).
 *   - 숨기면 조명이 꺼진다. 씬에서 떼면(삭제·undo) 조명도 씬에서 뗀다 (detachFromScene·attachToScene).
 *   - 값을 바꾸는 곳(미리보기·Command·파일 열기)은 모두 applyLightValues를 거치고 패널은 onLightChange로 구독한다.
 *   - 그림자: 켜진 조명마다 ShadowGenerator. 드리우는 쪽은 보이는 에디터 메쉬 전부, 받는 쪽은 에디터 메쉬와
 *     바닥의 그림자 받이(격자 바로 위의 투명한 판 — GridMaterial은 그림자를 받지 못한다).
 * 씬 전체를 밝히는 기본 조명(반구광)은 에디터 객체가 아니라 씬 설정의 "기본 조명 세기"다.
 */

export type LightValues = {
  /** sRGB "#RRGGBB" */
  color: string;
  intensity: number;
  /** 점광원·스포트가 닿는 거리 */
  range: number;
  /** 스포트 원뿔 전체 각도 (도) */
  angle: number;
  shadows: boolean;
};

/** 종류별로 쓰는 값 (패널에 보일 항목). 색·세기·그림자는 모두 */
export const LIGHT_FIELDS: Record<LightKind, readonly ("range" | "angle")[]> = {
  directional: [],
  point: ["range"],
  spot: ["range", "angle"],
};

/** PBR은 거리 제곱으로 빛이 줄어서 점광원·스포트는 방향광보다 훨씬 센 값이 기본이다 */
export const LIGHT_DEFAULTS: Record<LightKind, LightValues> = {
  directional: {
    color: "#FFFFFF",
    intensity: 1,
    range: 10,
    angle: 60,
    shadows: false,
  },
  point: {
    color: "#FFFFFF",
    intensity: 10,
    range: 10,
    angle: 60,
    shadows: false,
  },
  spot: {
    color: "#FFFFFF",
    intensity: 20,
    range: 10,
    angle: 60,
    shadows: false,
  },
};

/** 패널 슬라이더 범위이자 파일 검증 범위 (세기는 종류마다 최댓값이 다르다) */
export const LIGHT_RANGES = {
  intensity: {
    min: 0,
    step: 0.1,
    max: { directional: 10, point: 100, spot: 100 },
  },
  range: { min: 0.5, max: 50, step: 0.5 },
  angle: { min: 1, max: 179, step: 1 },
} as const;

const SHADOW_MAP_SIZE = 1024;
const SHADOW_CATCHER_NAME = "__shadow-catcher";

type EditorLight = {
  kind: LightKind;
  light: ShadowLight;
  values: LightValues;
  shadow: ShadowGenerator | null;
};

const editorLights = new WeakMap<AbstractMesh, EditorLight>();
const lightChanged = createKeyedListeners<AbstractMesh>();
const syncedScenes = new WeakSet<Scene>();

/** 이 조명의 값이 바뀌면 호출된다 */
export const onLightChange = lightChanged.subscribe;

/** 조명 아이콘 메쉬의 종류. 조명이 아니면 null */
export function getLightKind(mesh: AbstractMesh): LightKind | null {
  const presetId = getPresetId(mesh);
  return (presetId && findPreset(presetId)?.light) || null;
}

export function getLightValues(mesh: AbstractMesh): LightValues | null {
  const entry = editorLights.get(mesh);
  return entry ? { ...entry.values } : null;
}

/** 지금 쓰는 Babylon 조명 (테스트·내보내기용) */
export function getBabylonLight(mesh: AbstractMesh): ShadowLight | null {
  return editorLights.get(mesh)?.light ?? null;
}

export function isSameLight(a: LightValues, b: LightValues): boolean {
  return (
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.intensity === b.intensity &&
    a.range === b.range &&
    a.angle === b.angle &&
    a.shadows === b.shadows
  );
}

function createBabylonLight(kind: LightKind, name: string, scene: Scene) {
  // 아이콘의 원점에서 -Y로 비춘다 (부모인 아이콘을 돌리면 같이 돈다)
  const down = new Vector3(0, -1, 0);
  if (kind === "directional") {
    const light = new DirectionalLight(name, down, scene);
    light.position = Vector3.Zero();
    // 그림자 범위를 드리우는 메쉬에 맞춘다 (조명 뒤쪽 메쉬도 포함)
    light.autoCalcShadowZBounds = true;
    return light;
  }
  if (kind === "spot") {
    return new SpotLight(name, Vector3.Zero(), down, Math.PI / 3, 2, scene);
  }
  return new PointLight(name, Vector3.Zero(), scene);
}

/** 그림자를 드리우는 메쉬: 보이는 에디터 메쉬 (조명 아이콘 제외) */
function shadowCasters(scene: Scene): AbstractMesh[] {
  return inCreationOrder(scene.meshes).filter(
    (mesh) => !isLightObject(mesh) && !getMeshFlag(mesh, "hidden"),
  );
}

function getShadowCatcher(scene: Scene): Mesh {
  const existing = scene.getMeshByName(SHADOW_CATCHER_NAME);
  if (existing) return existing as Mesh;
  const catcher = CreateGround(
    SHADOW_CATCHER_NAME,
    { width: 100, height: 100 },
    scene,
  );
  catcher.position.y = 0.002; // 격자와 z-fighting 하지 않게
  catcher.isPickable = false;
  catcher.receiveShadows = true;
  const material = new ShadowOnlyMaterial(
    `${SHADOW_CATCHER_NAME} material`,
    scene,
  );
  material.shadowColor = new Color3(0, 0, 0);
  material.alpha = 0.5;
  catcher.material = material;
  return catcher;
}

/**
 * 씬마다 한 번: 매 프레임 그림자 드리우는 목록 갱신.
 * 그림자 받이는 한 조명의 그림자만 그리므로 켜져 있는 첫 그림자 조명을 쓴다.
 */
function bindLightSync(scene: Scene) {
  if (syncedScenes.has(scene)) return;
  syncedScenes.add(scene);

  scene.onBeforeRenderObservable.add(() => {
    let catcherLight: ShadowLight | null = null;
    let casters: AbstractMesh[] | null = null;
    for (const mesh of inCreationOrder(scene.meshes)) {
      const entry = editorLights.get(mesh);
      if (!entry?.shadow || !entry.light.isEnabled()) continue;
      casters ??= shadowCasters(scene);
      entry.shadow.getShadowMap()!.renderList = casters;
      catcherLight ??= entry.light;
    }
    const catcher = scene.getMeshByName(SHADOW_CATCHER_NAME);
    if (catcher) {
      catcher.setEnabled(catcherLight !== null);
      (catcher.material as ShadowOnlyMaterial).activeLight = catcherLight!;
    }
  });
}

/**
 * 에디터 객체를 씬에서 뗀다/다시 붙인다 (삭제·undo — mesh-commands). 조명이면 Babylon 조명도 같이.
 * Babylon의 onNewMeshAddedObservable은 다음 틱에 오므로 거기에 맡기지 않는다 (빠른 undo/redo에서 순서가 꼬인다).
 */
export function detachFromScene(scene: Scene, mesh: AbstractMesh) {
  scene.removeMesh(mesh);
  const entry = editorLights.get(mesh);
  if (entry) scene.removeLight(entry.light);
}

export function attachToScene(scene: Scene, mesh: AbstractMesh) {
  scene.addMesh(mesh);
  const entry = editorLights.get(mesh);
  if (entry && !scene.lights.includes(entry.light)) scene.addLight(entry.light);
}

function setValues(
  mesh: AbstractMesh,
  entry: EditorLight,
  values: LightValues,
) {
  const { light, kind } = entry;
  const color = Color3.FromHexString(values.color);
  light.diffuse = color.toLinearSpace();
  light.specular = light.diffuse.clone();
  light.intensity = values.intensity;
  if (kind !== "directional") light.range = values.range;
  if (light instanceof SpotLight) light.angle = (values.angle * Math.PI) / 180;
  // 아이콘은 조명 색 그대로 (조명을 받지 않는 단색)
  (mesh.material as StandardMaterial).emissiveColor = color;

  if (values.shadows && !entry.shadow) {
    const shadow = new ShadowGenerator(SHADOW_MAP_SIZE, light);
    shadow.usePercentageCloserFiltering = true;
    shadow.bias = 0.0005;
    shadow.normalBias = 0.01;
    entry.shadow = shadow;
    getShadowCatcher(mesh.getScene());
  } else if (!values.shadows && entry.shadow) {
    entry.shadow.dispose();
    entry.shadow = null;
  }
  entry.values = { ...values };
}

export function applyLightValues(mesh: AbstractMesh, values: LightValues) {
  const entry = editorLights.get(mesh);
  if (!entry) return;
  setValues(mesh, entry, values);
  lightChanged.emit(mesh);
}

/** 조명 객체를 원점에 만든다 (아이콘 메쉬 + Babylon 조명). 위치·회전은 호출하는 쪽이 정한다 */
export function addLightObject(
  scene: Scene,
  preset: MeshPreset,
  values?: LightValues,
  name?: string,
): Mesh {
  const kind = preset.light;
  if (!kind) throw new Error(`Not a light preset: ${preset.id}`);
  bindLightSync(scene);
  const mesh = addPresetMesh(scene, preset, undefined, name);
  const icon = new StandardMaterial(`${mesh.name} icon`, scene);
  icon.disableLighting = true;
  mesh.material = icon;

  const light = createBabylonLight(kind, `${mesh.name} light`, scene);
  light.parent = mesh;
  const entry: EditorLight = {
    kind,
    light,
    values: LIGHT_DEFAULTS[kind],
    shadow: null,
  };
  editorLights.set(mesh, entry);
  setValues(mesh, entry, values ?? LIGHT_DEFAULTS[kind]);
  // 숨기면 조명도 꺼진다
  onMeshFlagChange(mesh, () => light.setEnabled(!getMeshFlag(mesh, "hidden")));
  return mesh;
}

/**
 * 프리셋으로 에디터 객체 만들기 (메쉬든 조명이든). 배치·붙여넣기·파일 열기가 쓴다.
 * 메쉬에는 material·shape, 조명에는 light를 쓴다.
 */
export function addPresetObject(
  scene: Scene,
  preset: MeshPreset,
  {
    material,
    name,
    shape,
    light,
  }: {
    material?: MaterialValues | null;
    name?: string;
    shape?: ShapeParams;
    light?: LightValues | null;
  } = {},
): Mesh {
  return preset.light
    ? addLightObject(scene, preset, light ?? undefined, name)
    : addPresetMesh(scene, preset, material ?? undefined, name, shape);
}

/** 편집 한 번 = Command 하나 */
export function createLightCommand(
  mesh: AbstractMesh,
  before: LightValues,
  after: LightValues,
): Command {
  return {
    label: `${mesh.name} 조명`,
    execute: () => applyLightValues(mesh, after),
    undo: () => applyLightValues(mesh, before),
  };
}
