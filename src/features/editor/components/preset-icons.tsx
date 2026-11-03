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
  Pill,
  Square,
  Sun,
  Torus,
} from "lucide-react";

import { getPresetId, type MeshPresetId } from "../lib/mesh-presets";

/**
 * 프리셋 아이콘. lib(mesh-presets)에 UI 의존성을 넣지 않으려고 컴포넌트 쪽에서 매핑한다.
 * Record<MeshPresetId, …>라서 프리셋을 추가하고 아이콘을 빠뜨리면 타입 에러가 난다.
 */
export const PRESET_ICONS: Record<MeshPresetId, LucideIcon> = {
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

/** 메쉬의 프리셋 아이콘 (에디터 메쉬가 아니면 Box) */
export function MeshIcon({
  mesh,
  ...props
}: { mesh: AbstractMesh } & LucideProps) {
  const presetId = getPresetId(mesh);
  const Icon = presetId ? PRESET_ICONS[presetId] : Box;
  return <Icon strokeWidth={1.75} aria-hidden {...props} />;
}
