import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  Box,
  Cone,
  Cylinder,
  Flashlight,
  Gem,
  Globe,
  Lightbulb,
  type LucideIcon,
  type LucideProps,
  Package,
  Pill,
  Square,
  Sun,
  Torus,
} from "lucide-react";

import {
  type BuiltInPresetId,
  getPresetId,
  type MeshPresetId,
} from "../lib/mesh-presets";

/**
 * 프리셋 아이콘. lib(mesh-presets)에 UI 의존성을 넣지 않으려고 컴포넌트 쪽에서 매핑한다.
 * Record<BuiltInPresetId, …>라서 프리셋을 추가하고 아이콘을 빠뜨리면 타입 에러가 난다.
 */
const PRESET_ICONS: Record<BuiltInPresetId, LucideIcon> = {
  box: Box,
  sphere: Globe,
  "ico-sphere": Gem,
  cylinder: Cylinder,
  cone: Cone,
  capsule: Pill,
  torus: Torus,
  plane: Square,
  "directional-light": Sun,
  "point-light": Lightbulb,
  "spot-light": Flashlight,
};

/** 프리셋 아이콘. 가져온 모델은 모두 같은 상자 아이콘 */
export function PresetIcon({
  preset,
  ...props
}: { preset: MeshPresetId } & LucideProps) {
  const Icon = preset.startsWith("model:")
    ? Package
    : PRESET_ICONS[preset as BuiltInPresetId];
  return <Icon strokeWidth={1.75} aria-hidden {...props} />;
}

/** 메쉬의 프리셋 아이콘 (에디터 메쉬가 아니면 Box) */
export function MeshIcon({
  mesh,
  ...props
}: { mesh: AbstractMesh } & LucideProps) {
  const presetId = getPresetId(mesh);
  return presetId ? (
    <PresetIcon preset={presetId} {...props} />
  ) : (
    <Box strokeWidth={1.75} aria-hidden {...props} />
  );
}
