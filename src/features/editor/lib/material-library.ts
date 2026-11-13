import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { createListeners } from "@/lib/listeners";

import { createMeshProperty } from "./editable-property";
import { type Command, createMacroCommand, macroLabel } from "./history";
import {
  applyMaterialValues,
  createMeshMaterial,
  getMaterialValues,
  markSharedMaterial,
  type MaterialValues,
} from "./mesh-material";

/*
 * 공유 머티리얼 라이브러리: 이름 붙인 PBR 머티리얼 하나를 여러 메쉬가 같이 쓴다 ("빨간 플라스틱").
 *   - 연결된 메쉬의 머티리얼을 고치면 같은 머티리얼을 쓰는 메쉬가 모두 바뀐다 (materialProperty가 함께 알린다).
 *   - 연결 = mesh.material을 라이브러리 머티리얼로 바꾸는 것. 바꾸는 곳은 모두 materialSlotProperty를 거치고 Command로 기록한다.
 *     연결 해제는 지금 값의 전용 머티리얼을 새로 만들어 끼운다 (모양은 그대로).
 *   - 라이브러리 머티리얼은 메쉬를 지워도 해제하지 않는다 (markSharedMaterial). 새 씬·열기에서 비운다.
 *   - 씬 파일에는 메쉬가 쓰는 항목만 materials에 저장하고, 메쉬는 materialRef로 가리킨다. 복사본도 같은 항목에 연결된다.
 * 목록에서 지우는 기능은 없다 — 쓰는 메쉬가 없는 항목은 저장되지 않으므로 다음에 열면 사라진다.
 */

/** UI용 항목 (목록이 바뀔 때마다 새로 만든다) */
export type LibraryMaterial = { id: string; name: string };

export type LibraryEntry = LibraryMaterial & { material: PBRMaterial };

export type MaterialLibrary = {
  getEntries(): readonly LibraryMaterial[];
  /** 목록에 있는 항목의 머티리얼 (undo로 빠진 항목은 없음) */
  find(id: string): PBRMaterial | null;
  getName(id: string): string | null;
  /** 새 항목을 만든다 — 목록에는 아직 없다 (만들기 Command가 넣는다). 파일 열기는 저장된 id·이름을 넘긴다 */
  create(values: MaterialValues, saved?: LibraryMaterial): LibraryEntry;
  add(id: string): void;
  remove(id: string): void;
  /** 목록에 없는(undo로 빠진) 항목을 버리고 머티리얼을 해제한다 — 만들기 Command가 히스토리에서 빠질 때 */
  discard(id: string): void;
  rename(id: string, name: string): void;
  /** 새 씬·열기: 모든 항목을 버린다 (쓰는 메쉬가 다 해제된 뒤에) */
  clear(): void;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

/** 라이브러리 머티리얼 → 항목 id */
const libraryIds = new WeakMap<Material, string>();
const libraries = new WeakMap<Scene, MaterialLibrary>();

/** 메쉬가 쓰는 라이브러리 항목 id (전용 머티리얼이면 null) */
export function getLibraryId(mesh: AbstractMesh): string | null {
  return mesh.material ? getMaterialLibraryId(mesh.material) : null;
}

/** 라이브러리 머티리얼이면 그 항목 id */
export function getMaterialLibraryId(material: Material): string | null {
  return libraryIds.get(material) ?? null;
}

export function getMaterialLibrary(scene: Scene): MaterialLibrary | null {
  return libraries.get(scene) ?? null;
}

const newId = () => crypto.randomUUID().slice(0, 8);
const DEFAULT_NAME = "머티리얼";

export function createMaterialLibrary(scene: Scene): MaterialLibrary {
  /** 만든 항목 전부 (undo로 목록에서 빠져도 Command가 다시 넣을 수 있게 남긴다) */
  const created = new Map<string, LibraryEntry>();
  let order: string[] = [];
  let entries: readonly LibraryMaterial[] = [];
  let counter = 0;
  const listeners = createListeners();

  const emit = () => {
    entries = order.map((id) => {
      const { name } = created.get(id)!;
      return { id, name };
    });
    listeners.emit();
  };

  const library: MaterialLibrary = {
    getEntries: () => entries,
    find: (id) => (order.includes(id) ? created.get(id)!.material : null),
    getName: (id) => created.get(id)?.name ?? null,
    create(values, saved) {
      const id = saved?.id ?? newId();
      const name = saved?.name ?? `${DEFAULT_NAME} ${++counter}`;
      // 파일에서 연 "머티리얼 3" 뒤로 새 번호가 이어지게
      const number = Number(
        new RegExp(`^${DEFAULT_NAME} (\\d+)$`).exec(name)?.[1],
      );
      if (Number.isInteger(number)) counter = Math.max(counter, number);
      const material = createMeshMaterial(name, scene, values);
      markSharedMaterial(material);
      libraryIds.set(material, id);
      const entry = { id, name, material };
      created.set(id, entry);
      return entry;
    },
    add(id) {
      if (!created.has(id) || order.includes(id)) return;
      order = [...order, id];
      emit();
    },
    remove(id) {
      order = order.filter((item) => item !== id);
      emit();
    },
    discard(id) {
      const entry = created.get(id);
      if (!entry || order.includes(id)) return;
      entry.material.dispose(false, true);
      created.delete(id);
    },
    rename(id, name) {
      const entry = created.get(id);
      if (!entry) return;
      entry.name = entry.material.name = name;
      emit();
    },
    clear() {
      for (const { material } of created.values())
        material.dispose(false, true);
      created.clear();
      order = [];
      counter = 0;
      emit();
    },
    subscribe: listeners.subscribe,
    dispose() {
      library.clear();
      libraries.delete(scene);
      listeners.clear();
    },
  };
  libraries.set(scene, library);
  return library;
}

/**
 * 메쉬가 쓰는 머티리얼 (전용이든 라이브러리 것이든). 에디터 PBR 머티리얼이 아니면(조명 아이콘·모델) null.
 * 바꾸면 머티리얼 값도 새 머티리얼의 것으로 알린다 (패널이 다시 읽는다).
 */
export const materialSlotProperty = createMeshProperty<PBRMaterial>({
  verb: "머티리얼 연결",
  read: (mesh) =>
    mesh.material instanceof PBRMaterial && getMaterialValues(mesh)
      ? mesh.material
      : null,
  write(mesh, material) {
    mesh.material = material;
    applyMaterialValues(mesh, getMaterialValues(mesh)!);
  },
  isSame: (a, b) => a === b,
});

/**
 * 머티리얼 바꿔 끼우기 Command. 히스토리에서 빠질 때, 바꿔 끼운 쪽 중 지금 안 쓰는 전용 머티리얼은 해제한다
 * (연결하며 빠진 원래 머티리얼, 연결 해제를 되돌려 버려진 복사본).
 */
function createSlotCommand(
  mesh: AbstractMesh,
  before: PBRMaterial,
  after: PBRMaterial,
  label: string,
): Command {
  return {
    ...materialSlotProperty.createCommand(mesh, before, after),
    label,
    dispose() {
      for (const material of [before, after]) {
        if (
          material !== mesh.material &&
          !libraryIds.has(material) &&
          mesh.getScene().materials.includes(material)
        ) {
          material.dispose(false, true);
        }
      }
    },
  };
}

/** 메쉬를 라이브러리 머티리얼에 바로 연결 (만들 때 — 파일 열기·붙여넣기). 원래 전용 머티리얼은 해제한다 */
export function linkMaterial(mesh: AbstractMesh, material: PBRMaterial) {
  const own = mesh.material;
  mesh.material = material;
  if (own && own !== material && !libraryIds.has(own)) own.dispose(false, true);
}

/** 메쉬들을 라이브러리 항목에 연결하는 Command들 (이미 연결된 메쉬는 건너뛴다) */
export function createLinkCommands(
  meshes: readonly AbstractMesh[],
  material: PBRMaterial,
): Command[] {
  return meshes.flatMap((mesh) => {
    const current = materialSlotProperty.get(mesh);
    return current && current !== material
      ? [
          createSlotCommand(
            mesh,
            current,
            material,
            `${mesh.name} 머티리얼 연결`,
          ),
        ]
      : [];
  });
}

/** 연결된 메쉬들을 떼어 각자 전용 머티리얼(지금 값 복사)을 갖게 하는 Command들 */
export function createUnlinkCommands(
  meshes: readonly AbstractMesh[],
): Command[] {
  return meshes.flatMap((mesh) => {
    const current = materialSlotProperty.get(mesh);
    if (!current || !getLibraryId(mesh)) return [];
    const own = createMeshMaterial(
      `${mesh.name} Material`,
      mesh.getScene(),
      getMaterialValues(mesh)!,
    );
    return [
      createSlotCommand(mesh, current, own, `${mesh.name} 머티리얼 연결 해제`),
    ];
  });
}

/** 연결 Command들을 하나로 (없으면 null) */
export function createLinkCommand(
  meshes: readonly AbstractMesh[],
  material: PBRMaterial,
): Command | null {
  const commands = createLinkCommands(meshes, material);
  return commands.length > 0
    ? createMacroCommand(macroLabel(commands, "머티리얼 연결"), commands)
    : null;
}

export function createUnlinkCommand(
  meshes: readonly AbstractMesh[],
): Command | null {
  const commands = createUnlinkCommands(meshes);
  return commands.length > 0
    ? createMacroCommand(macroLabel(commands, "머티리얼 연결 해제"), commands)
    : null;
}

/**
 * 첫 메쉬의 지금 값으로 새 공유 머티리얼을 만들어 메쉬들을 연결하는 Command ("머티리얼 1 만들기").
 * undo하면 연결을 풀고 목록에서도 뺀다. 되돌린 채 히스토리에서 빠지면 머티리얼도 해제한다.
 */
export function createSharedMaterialCommand(
  library: MaterialLibrary,
  meshes: readonly AbstractMesh[],
): Command | null {
  const values = meshes.length > 0 ? getMaterialValues(meshes[0]) : null;
  if (!values) return null;
  const entry = library.create(values);
  const links = createLinkCommands(meshes, entry.material);
  return {
    label: `${entry.name} 만들기`,
    execute() {
      library.add(entry.id);
      for (const command of links) command.execute();
    },
    undo() {
      for (const command of links.toReversed()) command.undo();
      library.remove(entry.id);
    },
    dispose() {
      for (const command of links) command.dispose?.();
      library.discard(entry.id);
    },
  };
}

export function createRenameMaterialCommand(
  library: MaterialLibrary,
  id: string,
  name: string,
): Command | null {
  const before = library.getName(id);
  const after = name.trim();
  if (before === null || !after || after === before) return null;
  return {
    label: `${before} 이름 바꾸기`,
    execute: () => library.rename(id, after),
    undo: () => library.rename(id, before),
  };
}
