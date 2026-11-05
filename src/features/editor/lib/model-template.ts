import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

import { ensureLoadersRegistered } from "@/lib/babylon/loaders";

/*
 * 가져온 모델(glTF/GLB)의 원본 메쉬 (template). 에디터 객체는 "메쉬 하나"라서
 * glTF의 노드 계층을 월드 자세 그대로 구워 메쉬 하나로 합친다 — 재질마다 서브메쉬 (MultiMaterial).
 * → 선택·기즈모·외곽선·바닥에 붙이기·박스 선택·그림자·내보내기가 프리셋 메쉬와 같은 경로로 동작한다.
 * 애니메이션·스킨·모프 타깃은 버린다 (정지한 바인드 자세). glTF 머티리얼은 그대로 쓰고 편집하지 않는다.
 * 원본은 씬에서 떼어 두고(그려지지 않음) 객체를 만들 때 복제한다 — 지오메트리·머티리얼은 복제본끼리 공유.
 */

/** 정점이 있는 부분 메쉬들을 월드 자세로 구워 메쉬 하나로 합친다. 원본 부분들은 그대로 둔다 */
export function mergeModelParts(
  scene: Scene,
  name: string,
  meshes: readonly AbstractMesh[],
): Mesh {
  const parts = meshes.filter(
    (mesh): mesh is Mesh =>
      mesh instanceof Mesh &&
      mesh.getTotalVertices() > 0 &&
      mesh.getTotalIndices() > 0,
  );
  if (parts.length === 0) throw new Error("모델에 메쉬가 없습니다.");

  const materials: (Material | null)[] = [];
  const ranges: { material: number; start: number; count: number }[] = [];
  let indexOffset = 0;
  const datas = parts.map((part) => {
    const data = VertexData.ExtractFromMesh(part, true, true);
    // 스킨은 버린다 (뼈대 없이 바인드 자세로)
    data.matricesIndices = data.matricesWeights = null;
    data.matricesIndicesExtra = data.matricesWeightsExtra = null;
    // 음수 배율(glTF 오른손 → 왼손 변환)이면 transform이 면 방향도 뒤집는다
    data.transform(part.computeWorldMatrix(true));
    for (const subMesh of part.subMeshes) {
      const material =
        part.material instanceof MultiMaterial
          ? (part.material.subMaterials[subMesh.materialIndex] ?? null)
          : part.material;
      if (!materials.includes(material)) materials.push(material);
      ranges.push({
        material: materials.indexOf(material),
        start: indexOffset + subMesh.indexStart,
        count: subMesh.indexCount,
      });
    }
    indexOffset += data.indices?.length ?? 0;
    return data;
  });

  // 부분마다 UV·탄젠트·정점 색 유무가 달라도 합치게 빈 값을 채운다 (enableCompletion)
  const merged = datas[0].merge(datas.slice(1), true, false, false, true);
  const mesh = new Mesh(name, scene);
  merged.applyToMesh(mesh);
  mesh.sideOrientation = parts[0].sideOrientation;

  if (materials.length === 1) {
    mesh.material = materials[0];
  } else {
    const multi = new MultiMaterial(`${name} materials`, scene);
    multi.subMaterials = materials;
    mesh.material = multi;
    mesh.releaseSubMeshes();
    const vertices = mesh.getTotalVertices();
    for (const range of ranges) {
      new SubMesh(range.material, 0, vertices, range.start, range.count, mesh);
    }
  }
  return mesh;
}

/** GLB 바이트를 불러와 합친 원본 메쉬를 만든다 (씬에서 떼어 둔 상태) */
export async function loadModelTemplate(
  scene: Scene,
  name: string,
  bytes: Uint8Array,
): Promise<Mesh> {
  ensureLoadersRegistered();
  const { LoadAssetContainerAsync } =
    await import("@babylonjs/core/Loading/sceneLoader");
  const container = await LoadAssetContainerAsync(bytes, scene, {
    pluginExtension: ".glb",
    // 반복 노드를 InstancedMesh가 아니라 메쉬로 (합칠 수 있게)
    pluginOptions: { gltf: { createInstances: false } },
  });
  // 조명 변경 등에서 씬이 머티리얼을 다시 컴파일하도록 씬에 등록한다 (메쉬는 넣지 않는다)
  for (const material of container.materials) scene.addMaterial(material);
  for (const texture of container.textures) scene.addTexture(texture);
  // 부모부터 차례로 계산해야 자식의 월드 행렬이 맞다
  const computeTree = (node: Node) => {
    if (node instanceof TransformNode) node.computeWorldMatrix(true);
    for (const child of node.getChildren()) computeTree(child);
  };
  container.rootNodes.forEach(computeTree);
  try {
    const template = mergeModelParts(scene, name, container.meshes);
    scene.removeMesh(template);
    return template;
  } finally {
    // 머티리얼·텍스처는 원본이 쓰므로 남기고 나머지(노드·뼈대·애니메이션)만 해제
    for (const group of container.animationGroups) group.dispose();
    for (const skeleton of container.skeletons) skeleton.dispose();
    for (const mesh of container.meshes) mesh.dispose(false, false);
    for (const node of container.transformNodes) node.dispose(false, false);
  }
}
