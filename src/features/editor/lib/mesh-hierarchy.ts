import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { createListeners } from "@/lib/listeners";

import { type Command, createMacroCommand, macroLabel } from "./history";
import { inCreationOrder, isEditorMesh } from "./mesh-presets";
import {
  applyTransform,
  captureTransform,
  decomposeTransform,
  type TransformSnapshot,
} from "./transform-command";

/*
 * 부모-자식 계층. 에디터 객체(메쉬·조명)는 다른 에디터 객체의 자식이 될 수 있다 (Babylon mesh.parent).
 * 자식의 위치·회전·크기는 부모 기준(로컬) 값이다 — 속성 패널·씬 파일·변형 Command 모두.
 * 부모를 바꾸는 곳은 모두 setMeshParent를 거친다 (Babylon은 부모 변경을 알려주지 않는다
 * → 씬 목록은 onHierarchyChange를 구독한다. mesh.parent에 직접 대입하지 않는다).
 * 부모를 바꿀 땐 월드 자세를 유지한다 (Unity·Blender 기본). 비균일 크기 부모 아래에서 회전한 자식은
 * 전단이 생길 수 있어 위치·회전·크기(TRS)로 근사된다.
 * 숨김·잠금은 물려받지 않는다 (객체마다 따로).
 */

const hierarchyChanged = createListeners();

/** 바뀔 때마다 새 객체 — useSyncExternalStore 스냅샷용 (씬 목록이 트리를 다시 만든다) */
let snapshot = { getParent: getEditorParent };

export const onHierarchyChange = hierarchyChanged.subscribe;
export const getHierarchySnapshot = () => snapshot;

/** 에디터 객체인 부모 (없으면 null) */
export function getEditorParent(mesh: AbstractMesh): AbstractMesh | null {
  const parent = mesh.parent;
  return parent instanceof AbstractMesh && isEditorMesh(parent) ? parent : null;
}

function isInScene(mesh: AbstractMesh): boolean {
  return mesh.getScene().meshes.includes(mesh);
}

/** 씬에 있는 에디터 자식 (만든 순서). 삭제로 씬에서 뗀 자식은 parent가 남아 있어도 빠진다 */
export function getEditorChildren(mesh: AbstractMesh): AbstractMesh[] {
  return inCreationOrder(mesh.getChildMeshes(true)).filter(isInScene);
}

/** 씬에 있는 에디터 자손 전부 (자식 → 손자 순, 깊이 우선) */
export function getEditorDescendants(mesh: AbstractMesh): AbstractMesh[] {
  return getEditorChildren(mesh).flatMap((child) => [
    child,
    ...getEditorDescendants(child),
  ]);
}

/** 부모 → 조부모 … 순 */
export function getEditorAncestors(mesh: AbstractMesh): AbstractMesh[] {
  const ancestors: AbstractMesh[] = [];
  for (let p = getEditorParent(mesh); p; p = getEditorParent(p)) {
    ancestors.push(p);
  }
  return ancestors;
}

/** ancestor가 mesh의 (조)부모인가 */
export function isAncestorOf(
  ancestor: AbstractMesh,
  mesh: AbstractMesh,
): boolean {
  return getEditorAncestors(mesh).includes(ancestor);
}

/**
 * 조상이 함께 들어 있지 않은 것만 (순서 유지). 부모를 옮기면 자식이 따라가므로
 * 이동·삭제·복사는 이 목록에만 한다 — 아니면 자식이 두 번 움직이거나 두 번 지워진다.
 */
export function topLevelOnly(meshes: readonly AbstractMesh[]): AbstractMesh[] {
  const set = new Set(meshes);
  return meshes.filter(
    (mesh) => !getEditorAncestors(mesh).some((p) => set.has(p)),
  );
}

/** parent 아래로 옮길 수 있는가 (자기 자신·자기 자손 아래는 안 된다). null(최상위)은 늘 된다 */
export function canSetParent(
  mesh: AbstractMesh,
  parent: AbstractMesh | null,
): boolean {
  return parent === null || (parent !== mesh && !isAncestorOf(mesh, parent));
}

/** 부모만 바꾼다 (로컬 값 그대로 — 월드 자세 유지는 createParentCommand가 값을 다시 계산해서) */
export function setMeshParent(mesh: AbstractMesh, parent: AbstractMesh | null) {
  if (mesh.parent === parent) return;
  mesh.parent = parent;
  snapshot = { getParent: getEditorParent };
  hierarchyChanged.emit();
}

/** 월드 자세를 그대로 두고 parent 아래로 옮겼을 때의 로컬 변형 */
function transformUnder(
  mesh: AbstractMesh,
  parent: AbstractMesh | null,
): TransformSnapshot {
  const world = mesh.computeWorldMatrix(true);
  const local = parent
    ? world.multiply(Matrix.Invert(parent.computeWorldMatrix(true)))
    : world;
  return decomposeTransform(mesh, local);
}

type ParentState = {
  parent: AbstractMesh | null;
  transform: TransformSnapshot;
};

function applyParentState(mesh: AbstractMesh, state: ParentState) {
  setMeshParent(mesh, state.parent);
  applyTransform(mesh, state.transform);
}

/** 부모 바꾸기 Command (월드 자세 유지). 그대로거나 순환이면 null */
export function createParentCommand(
  mesh: AbstractMesh,
  parent: AbstractMesh | null,
): Command | null {
  if (getEditorParent(mesh) === parent || !canSetParent(mesh, parent)) {
    return null;
  }
  const before = {
    parent: getEditorParent(mesh),
    transform: captureTransform(mesh),
  };
  const after = { parent, transform: transformUnder(mesh, parent) };
  return {
    label: `${mesh.name} ${parent ? "부모 지정" : "부모 해제"}`,
    execute: () => applyParentState(mesh, after),
    undo: () => applyParentState(mesh, before),
  };
}

/**
 * 여러 객체를 parent 아래로 (null이면 최상위로) — Command 하나.
 * 부모 지정은 조상이 함께 고른 것은 빼고(자식은 조상을 따라 이미 들어간다), 순환이 되는 것도 뺀다.
 * 부모 해제는 고른 것 모두. 바뀌는 것이 없으면 null.
 * 각 Command는 만들 때의 월드 자세로 계산하지만, 부모를 바꿔도 월드 자세는 그대로라 차례로 실행해도 맞다.
 */
export function createSetParentCommand(
  meshes: readonly AbstractMesh[],
  parent: AbstractMesh | null,
): Command | null {
  const targets = parent
    ? topLevelOnly(meshes.filter((mesh) => mesh !== parent))
    : meshes;
  const commands = targets.flatMap(
    (mesh) => createParentCommand(mesh, parent) ?? [],
  );
  if (commands.length === 0) return null;
  return createMacroCommand(
    macroLabel(commands, parent ? "부모 지정" : "부모 해제"),
    commands,
  );
}

/** 씬 목록 한 줄 */
export type SceneTreeRow = {
  mesh: AbstractMesh;
  depth: number;
  /** 씬에 있는 자식 수 (접기 버튼 표시용) */
  childCount: number;
};

/**
 * 씬 목록용 트리를 펼친 줄 목록 (부모 → 자식 순, 같은 단계는 만든 순서).
 * meshes는 씬의 에디터 객체 (만든 순서). collapsed에 든 객체의 자손은 빠진다.
 * 부모가 목록에 없으면(그럴 일은 없지만) 최상위로 둔다.
 */
export function buildSceneTree(
  meshes: readonly AbstractMesh[],
  getParent: (mesh: AbstractMesh) => AbstractMesh | null,
  collapsed: ReadonlySet<AbstractMesh> = new Set(),
): SceneTreeRow[] {
  const inList = new Set(meshes);
  const children = new Map<AbstractMesh | null, AbstractMesh[]>();
  for (const mesh of meshes) {
    const parent = getParent(mesh);
    const key = parent && inList.has(parent) ? parent : null;
    const siblings = children.get(key);
    if (siblings) siblings.push(mesh);
    else children.set(key, [mesh]);
  }
  const rows: SceneTreeRow[] = [];
  const visit = (mesh: AbstractMesh, depth: number) => {
    const kids = children.get(mesh) ?? [];
    rows.push({ mesh, depth, childCount: kids.length });
    if (!collapsed.has(mesh)) for (const kid of kids) visit(kid, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  return rows;
}
