"use client";

import type { KeyboardEvent } from "react";
import Link from "next/link";

import type { BaseUIEvent } from "@base-ui/react/types";
import {
  Box as BoxIcon,
  ExternalLink,
  FileUp,
  type LucideIcon,
  Redo2,
  Search,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useCommandState } from "../hooks/use-command-state";
import {
  useActiveTool,
  useAssets,
  useGizmoSpace,
  useHistoryState,
  useOrthographic,
  usePerformanceState,
  useSceneFileState,
  useSnap,
} from "../hooks/use-editor-state";
import { modelMenuItems } from "../lib/add-menu";
import type { ViewName } from "../lib/camera-views";
import {
  alignSelected,
  distributeSelected,
  startPresetPlacement,
} from "../lib/editor-actions";
import type { CommandState } from "../lib/editor-commands";
import type { EditorRuntime } from "../lib/editor-runtime";
import {
  getPresetShortcut,
  getToolShortcut,
  SHORTCUT_LABELS,
  VIEW_SHORTCUTS,
} from "../lib/editor-shortcuts";
import type { AlignAxis, AlignEdge } from "../lib/mesh-align";
import { LIGHT_PRESETS, MESH_PRESETS } from "../lib/mesh-presets";
import {
  formatSnapStep,
  type GizmoSpace,
  SNAP_STEPS,
  type SnapKind,
  type TransformTool,
} from "../lib/tools";
import { MenubarCommandItem } from "./command-items";
import { PresetIcon } from "./preset-icons";
import { GIZMO_SPACE_LABELS, TOOL_ITEMS } from "./transform-toolbar";

const SNAP_MENU_LABELS: Record<SnapKind, string> = {
  move: "이동 스냅 단위",
  rotate: "회전 스냅 단위",
  scale: "크기 스냅 단위",
};

/** 보기 메뉴의 스냅 단위 하위 메뉴 (이동·회전·크기 각각) */
function SnapStepSubmenu({
  runtime,
  kind,
}: {
  runtime: EditorRuntime | null;
  kind: SnapKind;
}) {
  const snap = useSnap(runtime, kind);
  return (
    <MenubarSub>
      <MenubarSubTrigger disabled={!runtime || !snap.enabled}>
        {SNAP_MENU_LABELS[kind]}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {formatSnapStep(kind, snap.step)}
        </span>
      </MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={snap.step}
          onValueChange={(step: number) =>
            runtime?.tools.setSnapStep(kind, step)
          }
        >
          {SNAP_STEPS[kind].map((step) => (
            <MenubarRadioItem key={step} value={step} closeOnClick>
              {formatSnapStep(kind, step)}
            </MenubarRadioItem>
          ))}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}

/**
 * 메뉴를 쓰고 나면 포커스가 메뉴바 트리거에 남는데, Base UI 메뉴바는 Home/End를 자기 이동 키로 쓴다.
 * 에디터 단축키인 End(바닥에 붙이기)와 숫자패드(시점 — Num Lock이 꺼지면 key가 "Home"·"End")는 에디터로 넘긴다.
 * 열린 메뉴 안의 키는 editor-shortcuts가 무시하므로 메뉴 탐색은 그대로다.
 */
function passEditorKeys(event: BaseUIEvent<KeyboardEvent<HTMLElement>>) {
  if (event.key === "End" || event.code.startsWith("Numpad")) {
    event.preventBaseUIHandler();
  }
}

/** 보기 메뉴의 시점 (숫자패드가 없는 키보드용) — 짝(정면·뒤 …)끼리 묶는다 */
const VIEW_ITEMS: readonly (readonly { view: ViewName; label: string }[])[] = [
  [
    { view: "front", label: "정면" },
    { view: "back", label: "뒤" },
  ],
  [
    { view: "right", label: "오른쪽" },
    { view: "left", label: "왼쪽" },
  ],
  [
    { view: "top", label: "위" },
    { view: "bottom", label: "아래" },
  ],
];

const ALIGN_AXES: readonly AlignAxis[] = ["x", "y", "z"];
const ALIGN_EDGES: readonly { edge: AlignEdge; label: string }[] = [
  { edge: "min", label: "최소" },
  { edge: "center", label: "가운데" },
  { edge: "max", label: "최대" },
];

/**
 * 객체 메뉴: 숨기기·잠금 · 부모 지정(2개 이상)·해제 · 바닥에 붙이기 · 정렬(2개 이상) · 분배(3개 이상).
 * 정렬 기준은 선택 전체의 바운딩 박스 (mesh-align)
 */
function ObjectMenu({
  runtime,
  state,
}: {
  runtime: EditorRuntime | null;
  state: CommandState;
}) {
  const item = { runtime, state };
  const count = state.selectionCount;

  return (
    <MenubarMenu>
      <MenubarTrigger>객체</MenubarTrigger>
      <MenubarContent className="min-w-52">
        <MenubarCommandItem id="hide" {...item} />
        <MenubarCommandItem id="showAll" {...item} />
        <MenubarSeparator />
        <MenubarCommandItem id="lock" {...item} />
        <MenubarCommandItem id="unlock" {...item} />
        <MenubarSeparator />
        <MenubarCommandItem id="parent" {...item} />
        <MenubarCommandItem id="unparent" {...item} />
        <MenubarSeparator />
        <MenubarCommandItem id="dropToFloor" {...item} />
        <MenubarSub>
          <MenubarSubTrigger disabled={count < 2}>정렬</MenubarSubTrigger>
          <MenubarSubContent>
            {ALIGN_AXES.map((axis, index) => (
              <MenubarGroup key={axis}>
                {index > 0 && <MenubarSeparator />}
                {ALIGN_EDGES.map(({ edge, label }) => (
                  <MenubarItem
                    key={edge}
                    onClick={() =>
                      runtime && alignSelected(runtime, axis, edge)
                    }
                  >
                    {axis.toUpperCase()} {label}
                  </MenubarItem>
                ))}
              </MenubarGroup>
            ))}
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSub>
          <MenubarSubTrigger disabled={count < 3}>
            같은 간격으로 분배
          </MenubarSubTrigger>
          <MenubarSubContent>
            {ALIGN_AXES.map((axis) => (
              <MenubarItem
                key={axis}
                onClick={() => runtime && distributeSelected(runtime, axis)}
              >
                {axis.toUpperCase()}축
              </MenubarItem>
            ))}
          </MenubarSubContent>
        </MenubarSub>
      </MenubarContent>
    </MenubarMenu>
  );
}

function HistoryIconButton({
  icon: Icon,
  label,
  actionLabel,
  shortcut,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  actionLabel: string | null;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={!actionLabel}
            onClick={onClick}
          />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {actionLabel ? `${label}: ${actionLabel}` : label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

type EditorHeaderProps = {
  runtime: EditorRuntime | null;
};

/** 상단 헤더: 앱 이름 · 메뉴바(파일/편집/추가/객체/보기/도움말) · 실행 취소/다시 실행 · 파일 이름 · 렌더러 표시 */
export function EditorHeader({ runtime }: EditorHeaderProps) {
  const { undoLabel, redoLabel } = useHistoryState(runtime);
  const state = useCommandState(runtime);
  const item = { runtime, state };
  const activeTool = useActiveTool(runtime);
  const snapEnabled = useSnap(runtime, "move").enabled;
  const gizmoSpace = useGizmoSpace(runtime);
  const orthographic = useOrthographic(runtime);
  const showStats = usePerformanceState(runtime).visible;
  const file = useSceneFileState(runtime);
  const models = modelMenuItems(useAssets(runtime));
  const isWebGPU = runtime?.scene.getEngine().isWebGPU;

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground">
      <div className="flex items-center gap-1.5 px-1.5 text-xs font-semibold">
        <BoxIcon className="size-4 text-primary" aria-hidden />
        Babylon Editor
      </div>

      <Menubar
        className="h-7 border-none bg-transparent p-0 shadow-none"
        onKeyDown={passEditorKeys}
      >
        <MenubarMenu>
          <MenubarTrigger>파일</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.newScene()}
            >
              새 씬
            </MenubarItem>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.open()}
            >
              열기…
              <MenubarShortcut>{SHORTCUT_LABELS.open}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.save()}
            >
              저장
              <MenubarShortcut>{SHORTCUT_LABELS.save}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneFile.saveAs()}
            >
              다른 이름으로 저장…
              <MenubarShortcut>{SHORTCUT_LABELS.saveAs}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.assetImport.importModel()}
            >
              모델 가져오기(.glb)…
            </MenubarItem>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneExport.exportGlb()}
            >
              glTF(.glb)로 내보내기…
            </MenubarItem>
            <MenubarItem
              disabled={!runtime}
              onClick={() => void runtime?.sceneExport.saveScreenshot()}
            >
              스크린샷 저장…
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>편집</MenubarTrigger>
          <MenubarContent className="min-w-56">
            <MenubarItem
              disabled={!undoLabel}
              onClick={() => runtime?.history.undo()}
            >
              실행 취소
              {undoLabel && (
                <span className="truncate text-muted-foreground">
                  {undoLabel}
                </span>
              )}
              <MenubarShortcut>{SHORTCUT_LABELS.undo}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!redoLabel}
              onClick={() => runtime?.history.redo()}
            >
              다시 실행
              {redoLabel && (
                <span className="truncate text-muted-foreground">
                  {redoLabel}
                </span>
              )}
              <MenubarShortcut>{SHORTCUT_LABELS.redo}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarCommandItem id="cut" {...item} />
            <MenubarCommandItem id="copy" {...item} />
            <MenubarCommandItem id="paste" {...item} />
            <MenubarCommandItem id="duplicate" {...item} />
            <MenubarCommandItem id="rename" {...item} />
            <MenubarCommandItem id="delete" {...item} />
            <MenubarSeparator />
            <MenubarCommandItem id="selectAll" {...item} />
            <MenubarCommandItem id="deselect" {...item} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>추가</MenubarTrigger>
          <MenubarContent>
            <MenubarCommandItem id="addMenu" {...item}>
              <Search strokeWidth={1.75} aria-hidden />
            </MenubarCommandItem>
            <MenubarSeparator />
            {(
              [
                ["메쉬", MESH_PRESETS],
                ["조명", LIGHT_PRESETS],
              ] as const
            ).map(([group, presets], index) => (
              <MenubarGroup key={group}>
                {index > 0 && <MenubarSeparator />}
                <MenubarLabel>{group}</MenubarLabel>
                {presets.map((preset) => {
                  const shortcut = getPresetShortcut(preset.id);
                  return (
                    <MenubarItem
                      key={preset.id}
                      disabled={!runtime}
                      onClick={() => {
                        // 메뉴에서 고르면 항상 그 프리셋 배치 시작 (이미 켜져 있으면 유지)
                        if (runtime) {
                          startPresetPlacement(runtime.placement, preset);
                        }
                      }}
                    >
                      <PresetIcon
                        preset={preset.id}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      {preset.label}
                      {shortcut && (
                        <MenubarShortcut>{shortcut}</MenubarShortcut>
                      )}
                    </MenubarItem>
                  );
                })}
              </MenubarGroup>
            ))}
            <MenubarSeparator />
            <MenubarGroup>
              <MenubarLabel>모델</MenubarLabel>
              {models.map((item) => {
                return (
                  <MenubarItem
                    key={item.id}
                    onClick={() => {
                      if (runtime) {
                        startPresetPlacement(runtime.placement, item.preset);
                      }
                    }}
                  >
                    <PresetIcon
                      preset={item.preset.id}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {item.label}
                  </MenubarItem>
                );
              })}
              <MenubarItem
                disabled={!runtime}
                onClick={() => void runtime?.assetImport.importModel()}
              >
                <FileUp strokeWidth={1.75} aria-hidden />
                모델 가져오기…
              </MenubarItem>
            </MenubarGroup>
          </MenubarContent>
        </MenubarMenu>

        <ObjectMenu runtime={runtime} state={state} />

        <MenubarMenu>
          <MenubarTrigger>보기</MenubarTrigger>
          <MenubarContent className="min-w-48">
            <MenubarGroup>
              <MenubarLabel>도구</MenubarLabel>
              <MenubarRadioGroup
                value={activeTool}
                onValueChange={(tool: TransformTool) =>
                  runtime?.tools.setTool(tool)
                }
              >
                {TOOL_ITEMS.map(({ id, label, icon: Icon }) => (
                  <MenubarRadioItem
                    key={id}
                    value={id}
                    disabled={!runtime}
                    closeOnClick
                  >
                    <Icon aria-hidden />
                    {label}
                    <MenubarShortcut>{getToolShortcut(id)}</MenubarShortcut>
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarGroup>
              <MenubarLabel>기즈모 축</MenubarLabel>
              <MenubarRadioGroup
                value={gizmoSpace}
                onValueChange={(space: GizmoSpace) =>
                  runtime?.tools.setGizmoSpace(space)
                }
              >
                {(["local", "world"] as const).map((space) => (
                  <MenubarRadioItem
                    key={space}
                    value={space}
                    disabled={!runtime}
                    closeOnClick
                  >
                    {GIZMO_SPACE_LABELS[space]}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem
              closeOnClick
              checked={snapEnabled}
              disabled={!runtime}
              onCheckedChange={(checked) =>
                runtime?.tools.setSnapEnabled(checked)
              }
            >
              스냅
            </MenubarCheckboxItem>
            <SnapStepSubmenu runtime={runtime} kind="move" />
            <SnapStepSubmenu runtime={runtime} kind="rotate" />
            <SnapStepSubmenu runtime={runtime} kind="scale" />
            <MenubarSeparator />
            <MenubarCommandItem id="focus" {...item} />
            <MenubarSub>
              <MenubarSubTrigger disabled={!runtime}>시점</MenubarSubTrigger>
              <MenubarSubContent>
                {VIEW_ITEMS.map((pair, index) => (
                  <MenubarGroup key={pair[0].view}>
                    {index > 0 && <MenubarSeparator />}
                    {pair.map(({ view, label }) => (
                      <MenubarItem
                        key={view}
                        onClick={() => runtime?.cameraView.setView(view)}
                      >
                        {label}
                        <MenubarShortcut>
                          {VIEW_SHORTCUTS[view]}
                        </MenubarShortcut>
                      </MenubarItem>
                    ))}
                  </MenubarGroup>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarCheckboxItem
              closeOnClick
              checked={orthographic}
              disabled={!runtime}
              onCheckedChange={(checked) =>
                runtime?.cameraView.setOrthographic(checked)
              }
            >
              직교 투영
              <MenubarShortcut>{SHORTCUT_LABELS.orthographic}</MenubarShortcut>
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              closeOnClick
              checked={showStats}
              disabled={!runtime}
              onCheckedChange={(checked) => runtime?.stats.setVisible(checked)}
            >
              성능 표시
            </MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>도움말</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              disabled={!runtime}
              onClick={() => runtime?.help.setOpen(true)}
            >
              단축키
              <MenubarShortcut>{SHORTCUT_LABELS.help}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              render={<Link href="/manual" target="_blank" rel="noopener" />}
            >
              사용 설명서
              <ExternalLink aria-hidden />
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="mx-1 h-4 w-px bg-sidebar-border" aria-hidden />

      <div className="flex items-center gap-0.5">
        <HistoryIconButton
          icon={Undo2}
          label="실행 취소"
          actionLabel={undoLabel}
          shortcut={SHORTCUT_LABELS.undo}
          onClick={() => runtime?.history.undo()}
        />
        <HistoryIconButton
          icon={Redo2}
          label="다시 실행"
          actionLabel={redoLabel}
          shortcut={SHORTCUT_LABELS.redo}
          onClick={() => runtime?.history.redo()}
        />
      </div>

      {runtime && (
        <div className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{file.fileName ?? "제목 없음"}</span>
          {file.dirty && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary"
              aria-label="저장되지 않은 변경 사항"
            />
          )}
        </div>
      )}

      {runtime && (
        <Badge variant="outline" className="font-mono">
          {isWebGPU ? "WebGPU" : "WebGL"}
        </Badge>
      )}
    </header>
  );
}
