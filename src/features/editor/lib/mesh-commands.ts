import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { Command } from "./history";

/*
 * 메쉬 생성/삭제 Command.
 * undo/redo 시 메쉬를 dispose 하지 않고 씬에서 떼었다(removeMesh) 붙인다(addMesh).
 * → 객체가 그대로 유지되어 머티리얼·이후 추가될 속성을 다시 만들 필요가 없다.
 * 떼어둔 상태로 히스토리에서 빠지면(dispose) 그때 실제로 해제한다.
 */

function disposeMesh(mesh: AbstractMesh) {
  // 두 번째 인자: 이 메쉬 전용 머티리얼/텍스처도 함께 해제
  mesh.dispose(false, true);
}

/** 새 메쉬를 만드는 Command. 실행 후 getMesh()로 만든 메쉬를 얻는다 (선택 등에 사용). */
export type SpawnMeshCommand = Command & {
  getMesh(): AbstractMesh | null;
};

/**
 * 메쉬 생성 공통 Command (추가·붙여넣기·복제).
 * spawn은 첫 execute에서 한 번만 호출되고, redo는 같은 객체를 다시 붙인다.
 */
export function createSpawnMeshCommand(
  scene: Scene,
  spawn: () => AbstractMesh,
  verb: string,
  fallbackName: string,
): SpawnMeshCommand {
  let mesh: AbstractMesh | null = null;
  let inScene = false;

  return {
    get label() {
      return `${mesh?.name ?? fallbackName} ${verb}`;
    },
    getMesh: () => mesh,
    execute() {
      if (mesh) scene.addMesh(mesh);
      else mesh = spawn();
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
  /** 히스토리 라벨 동사 (잘라내기 등) */
  verb = "삭제",
): Command {
  let inScene = true;

  return {
    label: `${mesh.name} ${verb}`,
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
