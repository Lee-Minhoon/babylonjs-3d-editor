import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { Command } from "./history";
import { addPresetMesh, type MeshPreset } from "./mesh-presets";

/*
 * 메쉬 추가/삭제 Command.
 * undo/redo 시 메쉬를 dispose 하지 않고 씬에서 떼었다(removeMesh) 붙인다(addMesh).
 * → 객체가 그대로 유지되어 머티리얼·이후 추가될 속성을 다시 만들 필요가 없다.
 * 떼어둔 상태로 히스토리에서 빠지면(dispose) 그때 실제로 해제한다.
 */

function disposeMesh(mesh: AbstractMesh) {
  // 두 번째 인자: 이 메쉬 전용 머티리얼/텍스처도 함께 해제
  mesh.dispose(false, true);
}

export function createAddMeshCommand(
  scene: Scene,
  preset: MeshPreset,
  surfacePoint: Vector3,
): Command {
  let mesh: AbstractMesh | null = null;
  let inScene = false;
  const point = surfacePoint.clone();

  return {
    get label() {
      return `${mesh?.name ?? preset.label} 추가`;
    },
    execute() {
      if (mesh) scene.addMesh(mesh);
      else mesh = addPresetMesh(scene, preset, point);
      inScene = true;
    },
    undo() {
      if (mesh) scene.removeMesh(mesh);
      inScene = false;
    },
    dispose() {
      // undo된 상태(씬 밖)로 버려질 때만 해제. 씬에 있으면 씬이 소유한다.
      if (mesh && !inScene) disposeMesh(mesh);
    },
  };
}

export function createRemoveMeshCommand(
  scene: Scene,
  mesh: AbstractMesh,
): Command {
  let inScene = true;

  return {
    label: `${mesh.name} 삭제`,
    execute() {
      scene.removeMesh(mesh);
      inScene = false;
    },
    undo() {
      scene.addMesh(mesh);
      inScene = true;
    },
    dispose() {
      if (!inScene) disposeMesh(mesh);
    },
  };
}
