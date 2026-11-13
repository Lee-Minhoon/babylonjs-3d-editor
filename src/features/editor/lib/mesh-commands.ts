import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { attachToScene, detachFromScene } from "./editor-lights";
import type { Command } from "./history";
import { getEditorDescendants } from "./mesh-hierarchy";
import { isSharedMaterial } from "./mesh-material";

/*
 * 메쉬 생성/삭제 Command.
 * undo/redo 시 메쉬를 dispose 하지 않고 씬에서 떼었다 붙인다 (detachFromScene·attachToScene — 조명이면 조명도 같이).
 * → 객체가 그대로 유지되어 머티리얼·이후 추가될 속성을 다시 만들 필요가 없다.
 * 떼어둔 상태로 히스토리에서 빠지면(dispose) 그때 실제로 해제한다.
 * 자식이 있으면 자손까지 함께 떼고 붙인다 (Unity처럼 부모를 지우면 자식도 지워진다).
 * 함께 뗄 자손은 뗄 때 씬에 있는 것으로 정한다 — 먼저 따로 지운 자식이 부모 undo로 되살아나지 않게.
 */

/** 이 객체와 씬에 있는 자손을 떼고, 뗀 목록을 돌려준다 */
function detachTree(scene: Scene, mesh: AbstractMesh): AbstractMesh[] {
  const tree = [mesh, ...getEditorDescendants(mesh)];
  for (const item of tree) detachFromScene(scene, item);
  return tree;
}

function attachTree(scene: Scene, tree: readonly AbstractMesh[]) {
  for (const item of tree) attachToScene(scene, item);
}

/**
 * 에디터 객체를 실제로 해제한다 (자손 객체·조명과 이 객체 전용 머티리얼/텍스처까지).
 * 같이 쓰는 머티리얼(모델 원본의 것 등)은 떼어 내고 해제한다 — Babylon은 다른 메쉬가 쓰는지 보지 않는다.
 */
export function disposeEditorObject(mesh: AbstractMesh) {
  for (const item of [mesh, ...mesh.getChildMeshes(false)]) {
    if (isSharedMaterial(item.material)) item.material = null;
  }
  mesh.dispose(false, true);
}

/** 새 메쉬를 만드는 Command. 실행 후 getMesh()로 만든 메쉬를 얻는다 (선택 등에 사용). */
export type SpawnMeshCommand = Command & {
  getMesh(): AbstractMesh | null;
};

/**
 * 메쉬 생성 공통 Command (추가·붙여넣기·복제).
 * spawn은 첫 execute에서 한 번만 호출되고, redo는 같은 객체를 다시 붙인다.
 * 라벨은 만들 때의 이름으로 굳힌다 — 나중에 이름을 바꿔도 히스토리의 "Box 1 추가"는 그대로.
 */
export function createSpawnMeshCommand(
  scene: Scene,
  spawn: () => AbstractMesh,
  verb: string,
  fallbackName: string,
): SpawnMeshCommand {
  let mesh: AbstractMesh | null = null;
  let tree: AbstractMesh[] = [];
  let inScene = false;
  let label = `${fallbackName} ${verb}`;

  return {
    get label() {
      return label;
    },
    getMesh: () => mesh,
    execute() {
      if (mesh) attachTree(scene, tree);
      else {
        mesh = spawn();
        label = `${mesh.name} ${verb}`;
      }
      inScene = true;
    },
    undo() {
      if (mesh) tree = detachTree(scene, mesh);
      inScene = false;
    },
    dispose() {
      // undo된 상태(씬 밖)로 버려질 때만 해제. 씬에 있으면 씬이 소유한다.
      if (mesh && !inScene) disposeEditorObject(mesh);
    },
  };
}

export function createRemoveMeshCommand(
  scene: Scene,
  mesh: AbstractMesh,
  /** 히스토리 라벨 동사 (잘라내기 등) */
  verb = "삭제",
): Command {
  let tree: AbstractMesh[] = [];
  let inScene = true;

  return {
    label: `${mesh.name} ${verb}`,
    execute() {
      tree = detachTree(scene, mesh);
      inScene = false;
    },
    undo() {
      attachTree(scene, tree);
      inScene = true;
    },
    dispose() {
      if (!inScene) disposeEditorObject(mesh);
    },
  };
}
