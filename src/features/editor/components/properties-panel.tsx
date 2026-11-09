"use client";

import { type ReactNode, useMemo } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { useAssets, useSelection } from "../hooks/use-editor-state";
import { useMeshHierarchy } from "../hooks/use-mesh-hierarchy";
import { useMeshName } from "../hooks/use-mesh-name";
import type { EditorRuntime } from "../lib/editor-runtime";
import { MESH_NAME_INPUT_ID } from "../lib/mesh-name";
import { isLightObject, isModelObject } from "../lib/mesh-presets";
import { HistoryPanel } from "./history-panel";
import { LightSection } from "./light-section";
import { MaterialSection } from "./material-section";
import { MeshNameInput } from "./mesh-name-input";
import { MeshIcon } from "./preset-icons";
import { SceneSettingsSection } from "./scene-settings-section";
import { ShapeSection, sharedShapePreset } from "./shape-section";
import { TransformSection } from "./transform-section";
import { MIXED_LABEL } from "./value-fields";

type PropertiesPanelProps = {
  runtime: EditorRuntime | null;
};

function MeshNameLabel({ mesh }: { mesh: AbstractMesh }) {
  return <span className="truncate">{useMeshName(mesh)}</span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** 부모가 있으면 변형 값이 부모 기준이라고 알린다 */
function ParentNote({ mesh }: { mesh: AbstractMesh }) {
  const parent = useMeshHierarchy().getParent(mesh);
  return parent ? <ParentNoteText parent={parent} /> : null;
}

function ParentNoteText({ parent }: { parent: AbstractMesh }) {
  return (
    <p className="text-muted-foreground">
      위치·회전·크기는 부모{" "}
      <span className="font-medium text-foreground">{useMeshName(parent)}</span>{" "}
      기준입니다.
    </p>
  );
}

/** 여러 개 선택의 머리: 개수와 메쉬 목록 */
/** 여러 개 선택 목록에 이름을 보이는 수 (수천 개를 고르면 나머지는 개수만) */
const MULTI_SELECTION_LIST_LIMIT = 50;

function MultiSelectionHeader({ meshes }: { meshes: readonly AbstractMesh[] }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">메쉬 {meshes.length}개 선택됨</div>
      <ul className="max-h-28 space-y-1 overflow-y-auto">
        {meshes.slice(0, MULTI_SELECTION_LIST_LIMIT).map((mesh) => (
          <li key={mesh.uniqueId} className="flex items-center gap-2">
            <MeshIcon mesh={mesh} className="size-3.5 text-muted-foreground" />
            <MeshNameLabel mesh={mesh} />
          </li>
        ))}
        {meshes.length > MULTI_SELECTION_LIST_LIMIT && (
          <li className="text-muted-foreground">
            외 {meshes.length - MULTI_SELECTION_LIST_LIMIT}개
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * 속성 패널: 메쉬를 고르면 변형 · 모양(같은 프리셋일 때) · 조명(조명 객체) · 머티리얼(메쉬) (여러 개면 함께 편집 — 값이 다른 칸은 "—"),
 * 선택이 없으면 씬 설정. 아래에는 히스토리 패널.
 */
export function PropertiesPanel({ runtime }: PropertiesPanelProps) {
  const selected = useSelection(runtime);
  const mesh = selected.length === 1 ? selected[0] : null;
  // key: 선택이 바뀌면 편집 중 상태(before)를 버린다
  const selectionKey = selected.map(({ uniqueId }) => uniqueId).join(",");
  // 모양 값은 고른 메쉬가 모두 같은 프리셋일 때만 (프리셋마다 항목이 다르다)
  const shapePreset = sharedShapePreset(selected);
  // 조명과 메쉬를 함께 골랐으면 각자의 칸에 각자만 (구독 훅에 넘기므로 선택이 바뀔 때만 새 배열)
  const lights = useMemo(() => selected.filter(isLightObject), [selected]);
  const hasMeshes = lights.length < selected.length;
  // 가져온 모델은 glTF 머티리얼 그대로라 머티리얼 칸에서 뺀다
  const models = selected.filter(isModelObject);
  const images = useAssets(runtime).filter((asset) => asset.type === "image");
  const materialMeshes = useMemo(
    () =>
      selected.filter((item) => !isLightObject(item) && !isModelObject(item)),
    [selected],
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-xs text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 px-3">
        <h2 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
          속성
        </h2>
      </div>
      <Separator />
      {runtime && selected.length > 0 ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            {mesh ? (
              <div className="flex items-center gap-2">
                <MeshIcon
                  mesh={mesh}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <MeshNameInput
                  key={mesh.uniqueId}
                  id={MESH_NAME_INPUT_ID}
                  mesh={mesh}
                  history={runtime.history}
                  className="h-7 text-sm font-medium"
                />
              </div>
            ) : (
              <MultiSelectionHeader meshes={selected} />
            )}
            {mesh && <ParentNote mesh={mesh} />}
            <TransformSection
              key={selectionKey}
              meshes={selected}
              history={runtime.history}
              withScaling={hasMeshes}
            />
            <p className="text-muted-foreground">
              축 이름(X/Y/Z)을 좌우로 드래그해 값을 조절할 수 있습니다.
              {!mesh &&
                ` 여러 개면 입력한 값이 모두에 들어갑니다 (값이 서로 다른 칸은 ${MIXED_LABEL}).`}
            </p>
            {shapePreset && (
              <>
                <Separator />
                <div>
                  <SectionTitle>모양</SectionTitle>
                  <ShapeSection
                    key={selectionKey}
                    preset={shapePreset}
                    meshes={selected}
                    history={runtime.history}
                  />
                </div>
              </>
            )}
            {lights.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionTitle>조명</SectionTitle>
                  <LightSection
                    key={selectionKey}
                    lights={lights}
                    history={runtime.history}
                  />
                </div>
              </>
            )}
            {hasMeshes && (
              <>
                <Separator />
                <div>
                  <SectionTitle>머티리얼</SectionTitle>
                  {materialMeshes.length > 0 && (
                    <MaterialSection
                      key={selectionKey}
                      meshes={materialMeshes}
                      history={runtime.history}
                      library={runtime.materials}
                      images={images}
                      onImportImage={runtime.assetImport.importImage}
                    />
                  )}
                  {models.length > 0 && (
                    <p className="text-muted-foreground">
                      가져온 모델은 파일에 든 머티리얼을 그대로 씁니다 (편집할
                      수 없음).
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      ) : runtime ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            <div>
              <SectionTitle>씬 설정</SectionTitle>
              <SceneSettingsSection
                scene={runtime.scene}
                history={runtime.history}
              />
            </div>
            <p className="text-muted-foreground">
              메쉬를 선택하면 위치·회전·크기와 머티리얼을 편집할 수 있습니다.
            </p>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1" />
      )}
      <HistoryPanel runtime={runtime} />
    </aside>
  );
}
