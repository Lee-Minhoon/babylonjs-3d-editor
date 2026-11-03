"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";

import { AUTOSAVE_DELAY } from "../lib/autosave";
import { TOOL_LABELS } from "../lib/editor-reference";
import {
  getPresetShortcut,
  getToolShortcut,
  SHORTCUT_LABELS,
  VIEW_SHORTCUTS,
} from "../lib/editor-shortcuts";
import { MATERIAL_DEFAULTS } from "../lib/mesh-material";
import { MESH_PRESETS } from "../lib/mesh-presets";
import {
  DEFAULT_SCENE_SETTINGS,
  SETTING_RANGES,
  TONE_MAPPINGS,
} from "../lib/scene-settings";
import {
  DEFAULT_SNAP_STEPS,
  formatSnapStep,
  SNAP_STEPS,
  type SnapKind,
} from "../lib/tools";
import { PRESET_ICONS } from "./preset-icons";
import { MouseControlsTable, ShortcutGroups } from "./shortcut-reference";

/*
 * 사용 설명서 (/manual). 단축키·메쉬 종류·스냅 단위는 에디터가 쓰는 값에서 가져온다 — 손으로 다시 적지 않는다.
 * 동작 설명(글)은 CLAUDE.md의 에디터 구조와 맞춰 둔다.
 */

const SECTIONS = [
  { id: "layout", title: "화면 구성" },
  { id: "add", title: "메쉬 추가" },
  { id: "select", title: "선택" },
  { id: "camera", title: "카메라" },
  { id: "transform", title: "변형 (위치·회전·크기)" },
  { id: "material", title: "머티리얼" },
  { id: "scene-settings", title: "씬 설정 (배경·조명 느낌)" },
  { id: "object", title: "숨기기·잠금·정렬" },
  { id: "clipboard", title: "복사·붙여넣기·복제" },
  { id: "file", title: "저장·열기·내보내기" },
  { id: "shortcuts", title: "단축키 전체" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const SNAP_KIND_LABELS: Record<SnapKind, string> = {
  move: "위치",
  rotate: "회전",
  scale: "크기",
};

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((section) => section.id === id)?.title;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h2
        id={`${id}-title`}
        className="mb-3 border-b pb-2 text-lg font-semibold"
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

function Term({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

export function ManualPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[12rem_minmax(0,1fr)] md:px-6">
        <nav aria-label="목차" className="md:sticky md:top-10 md:self-start">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            에디터로
          </Link>
          <ol className="space-y-1 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0 space-y-10">
          <header className="space-y-2">
            <h1 className="text-2xl font-bold">사용 설명서</h1>
            <p className="text-sm text-muted-foreground">
              브라우저에서 기본 도형을 놓고 다듬는 3D 에디터입니다. 단축키는 맥
              기호로 적었습니다 — Windows에서는 ⌘가 Ctrl, ⌥가 Alt입니다.
              에디터에서 <Kbd>{SHORTCUT_LABELS.help}</Kbd>를 누르면 단축키
              요약이 열립니다.
            </p>
          </header>

          <Section id="layout">
            <List>
              <li>
                <Term>위 메뉴바</Term>: 파일 · 편집 · 추가 · 객체 · 보기 ·
                도움말, 실행 취소/다시 실행 버튼, 파일 이름(저장 안 된 변경이
                있으면 점 표시).
              </li>
              <li>
                <Term>왼쪽</Term>: 메쉬 추가 버튼과 씬 목록. 목록에서 클릭해
                선택하고, 더블클릭해 이름을 바꾸고, 줄 끝의 자물쇠·눈·✕로
                잠그기·숨기기·삭제합니다.
              </li>
              <li>
                <Term>가운데</Term>: 3D 뷰포트. 왼쪽 위 툴바에서 도구, 기즈모
                축(로컬/월드), 스냅 단위를 고릅니다.
              </li>
              <li>
                <Term>오른쪽 속성 패널</Term>: 메쉬 하나를 골랐을 때
                이름·위치·회전·크기·머티리얼을 편집합니다. 여러 개를 고르면
                목록만 보입니다. 아무것도 고르지 않으면 씬 설정이 보입니다.
              </li>
            </List>
          </Section>

          <Section id="add">
            <p>
              왼쪽 버튼이나 숫자 키로 배치 모드를 켜고, 뷰포트를 클릭할 때마다
              그 자리에 놓습니다. <Kbd>{SHORTCUT_LABELS.deselect}</Kbd>나
              우클릭으로 끝냅니다.
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MESH_PRESETS.map((preset) => {
                const Icon = PRESET_ICONS[preset.id];
                const shortcut = getPresetShortcut(preset.id);
                return (
                  <li
                    key={preset.id}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-2"
                  >
                    <Icon
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="flex-1">{preset.label}</span>
                    {shortcut && <Kbd>{shortcut}</Kbd>}
                  </li>
                );
              })}
            </ul>
            <List>
              <li>
                메쉬 윗면을 가리키면 그 위에 쌓이고, 아니면 바닥(높이 0)에
                놓입니다. 스냅이 켜져 있으면 가로 위치가 격자에 맞춰집니다.
              </li>
              <li>
                배치 중 <Kbd>{SHORTCUT_LABELS.rotatePlacement}</Kbd>/
                <Kbd>⇧{SHORTCUT_LABELS.rotatePlacement}</Kbd>로 미리보기를 90°씩
                돌립니다.
              </li>
              <li>
                새 메쉬는 이름에 번호가 붙고(Box 1, Box 2 …) 색은 무작위입니다.
              </li>
            </List>
          </Section>

          <Section id="select">
            <List>
              <li>
                뷰포트나 씬 목록을 클릭하면 그것만 선택합니다. Shift·⌘+클릭은
                선택에 넣거나 뺍니다. 빈 곳을 클릭하면 선택이 풀립니다.
              </li>
              <li>
                <Term>박스 선택</Term>: 선택 도구(
                <Kbd>{getToolShortcut("select")}</Kbd>)에서 빈 곳을
                드래그하거나, 어느 도구에서든 Shift+드래그합니다. Shift를 누르면
                기존 선택에 더합니다.
              </li>
              <li>
                <Kbd>{SHORTCUT_LABELS.selectAll}</Kbd>는 전체 선택,{" "}
                <Kbd>{SHORTCUT_LABELS.deselect}</Kbd>는 선택 해제입니다.
              </li>
              <li>선택은 실행 취소 기록에 남지 않습니다.</li>
            </List>
          </Section>

          <Section id="camera">
            <MouseControlsTable />
            <List>
              <li>
                <Kbd>{SHORTCUT_LABELS.focus}</Kbd>: 선택한 메쉬가 화면에
                들어오게 다가갑니다 (보는 방향은 그대로).
              </li>
              <li>
                숫자패드 <Kbd>{VIEW_SHORTCUTS.front}</Kbd>{" "}
                <Kbd>{VIEW_SHORTCUTS.right}</Kbd>{" "}
                <Kbd>{VIEW_SHORTCUTS.top}</Kbd>: 정면 · 오른쪽 · 위 시점. ⌃와
                함께 누르면 반대편입니다.{" "}
                <Kbd>{SHORTCUT_LABELS.orthographic}</Kbd>는 원근 ↔ 직교
                전환입니다. 숫자패드가 없으면 보기 메뉴의
                &ldquo;시점&rdquo;·&ldquo;직교 투영&rdquo;을 씁니다.
              </li>
              <li>카메라 움직임은 실행 취소 기록에 남지 않습니다.</li>
            </List>
          </Section>

          <Section id="transform">
            <p>
              메쉬를 고르고 도구를 바꾸면 기즈모가 나타납니다. 축
              화살표·고리·상자를 끌어 옮기고, 돌리고, 크기를 바꿉니다.
            </p>
            <ul className="flex flex-wrap gap-2">
              {(["move", "rotate", "scale"] as const).map((tool) => (
                <li
                  key={tool}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                >
                  {TOOL_LABELS[tool]} <Kbd>{getToolShortcut(tool)}</Kbd>
                </li>
              ))}
            </ul>
            <List>
              <li>
                <Term>여러 개</Term>를 고르면 묶음의 가운데를 기준으로 함께
                움직입니다. 드래그 한 번이 실행 취소 한 번입니다.
              </li>
              <li>
                <Term>기즈모 축</Term>: 로컬(메쉬 자신의 방향, 기본) 또는 월드.
                툴바와 보기 메뉴에서 바꿉니다. 크기 기즈모는 항상 로컬입니다.
              </li>
              <li>
                <Term>스냅</Term>: 켜고 끄는 건 하나이고, 단위는 종류마다 따로
                고릅니다. 툴바는 지금 도구의 단위를, 보기 메뉴는 셋 다
                보여줍니다.
              </li>
            </List>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">스냅 단위</caption>
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    종류
                  </th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    고를 수 있는 단위
                  </th>
                  <th scope="col" className="py-1.5 font-medium">
                    기본
                  </th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(SNAP_STEPS) as SnapKind[]).map((kind) => (
                  <tr key={kind} className="border-b last:border-0">
                    <th scope="row" className="py-1.5 pr-4 font-normal">
                      {SNAP_KIND_LABELS[kind]}
                    </th>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {SNAP_STEPS[kind]
                        .map((step) => formatSnapStep(kind, step))
                        .join(" · ")}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {formatSnapStep(kind, DEFAULT_SNAP_STEPS[kind])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-foreground">
              크기 스냅은 배율에 더해지는 양입니다 (×0.1이면 1 → 1.1 → 1.2).
            </p>
            <p>
              <Term>속성 패널</Term>에서 위치·회전(도)·크기를 숫자로 입력할 수
              있습니다. Enter로 확정, Esc로 취소하고, 축 이름(X/Y/Z)을 좌우로
              끌어 값을 조절합니다.
            </p>
          </Section>

          <Section id="material">
            <p>
              메쉬마다 PBR 머티리얼(glTF와 같은 metallic-roughness 방식)을
              하나씩 가집니다. 속성 패널에서 바꿉니다.
            </p>
            <List>
              <li>
                <Term>기본색</Term>: 색 고르기 창 또는 hex(#RRGGBB) 입력.
              </li>
              <li>
                <Term>메탈릭</Term>: 0(비금속) ~ 1(금속), 기본{" "}
                {MATERIAL_DEFAULTS.metallic}.
              </li>
              <li>
                <Term>거칠기</Term>: 0(매끈, 선명한 반사) ~ 1(거칢), 기본{" "}
                {MATERIAL_DEFAULTS.roughness}.
              </li>
              <li>
                <Term>발광색</Term>: 조명과 상관없이 더해지는 빛의 색.
                검정(기본)이면 발광하지 않습니다. 주변을 밝히지는 않습니다.
              </li>
              <li>
                <Term>불투명도</Term>: 1(불투명, 기본) ~ 0(완전히 투명). 1보다
                작으면 반투명하게 그립니다. 반투명 메쉬끼리 서로 파고들면 앞뒤
                순서가 어긋나 보일 수 있습니다.
              </li>
              <li>
                <Term>조명 무시</Term>: 켜면 조명·환경 반사와 상관없이 기본색
                그대로 보입니다 (표지판·단색 표시물용). 메탈릭·거칠기는 쓰이지
                않습니다.
              </li>
              <li>
                슬라이더를 놓거나 색 창을 닫을 때 실행 취소 한 번으로
                기록됩니다.
              </li>
            </List>
          </Section>

          <Section id="scene-settings">
            <p>
              아무것도 선택하지 않으면 속성 패널이 씬 설정으로 바뀝니다. 씬
              파일에 함께 저장되고, 바꾼 값은 실행 취소할 수 있습니다. 새 씬은
              기본값으로 시작합니다.
            </p>
            <List>
              <li>
                <Term>배경색</Term>: 기본 {DEFAULT_SCENE_SETTINGS.background}.
                바닥 격자에 가려서 화면에서는 지평선 위로 보이고, 스크린샷에서는
                격자가 빠지므로 전체 배경이 됩니다.
              </li>
              <li>
                <Term>환경광 세기</Term>: 환경 반사와 간접광의 세기 (0 ~{" "}
                {SETTING_RANGES.environmentIntensity.max}, 기본{" "}
                {DEFAULT_SCENE_SETTINGS.environmentIntensity}). 0이면 금속에
                반사가 비치지 않습니다.
              </li>
              <li>
                <Term>노출</Term>: 메쉬 전체의 밝기 배율 (0 ~{" "}
                {SETTING_RANGES.exposure.max}, 기본{" "}
                {DEFAULT_SCENE_SETTINGS.exposure}).
              </li>
              <li>
                <Term>톤 매핑</Term>: 밝은 부분이 하얗게 날아가지 않게 색을 눌러
                줍니다. {TONE_MAPPINGS.map(({ label }) => label).join(" · ")}.
                기본은 없음입니다.
              </li>
              <li>
                노출·톤 매핑은 메쉬에만 적용됩니다. 배경색과 바닥 격자는
                그대로입니다.
              </li>
            </List>
          </Section>

          <Section id="object">
            <List>
              <li>
                <Term>숨기기</Term> (<Kbd>{SHORTCUT_LABELS.hide}</Kbd>, 모두
                보이기 <Kbd>{SHORTCUT_LABELS.showAll}</Kbd>): 화면에서 감춥니다.
                숨긴 메쉬는 선택할 수 없고 그 위에 놓을 수도 없습니다.
              </li>
              <li>
                <Term>잠금</Term>: 뷰포트 클릭·박스 선택·전체 선택으로 고를 수
                없습니다. 씬 목록에서는 고르고 편집할 수 있고, 그 위에 다른
                메쉬를 놓을 수 있습니다 — 바닥판처럼 건드리지 않을 배경에
                씁니다.
              </li>
              <li>
                <Term>바닥에 붙이기</Term> (
                <Kbd>{SHORTCUT_LABELS.dropToFloor}</Kbd>, 맥은 fn+→): 바로 아래
                메쉬 윗면이나 바닥에 밑면을 맞춥니다. 여러 개면 아래 것부터
                차례로 쌓입니다.
              </li>
              <li>
                <Term>정렬</Term> (2개 이상, 객체 메뉴): X/Y/Z 축마다
                최소·가운데·최대 면을 선택 전체의 범위에 맞춥니다.
              </li>
              <li>
                <Term>같은 간격으로 분배</Term> (3개 이상): 양 끝은 두고 사이
                메쉬의 중심을 같은 간격으로 놓습니다.
              </li>
              <li>모두 실행 취소할 수 있고, 숨김·잠금은 파일에 저장됩니다.</li>
            </List>
          </Section>

          <Section id="clipboard">
            <List>
              <li>
                <Kbd>{SHORTCUT_LABELS.copy}</Kbd> 복사 ·{" "}
                <Kbd>{SHORTCUT_LABELS.cut}</Kbd> 잘라내기 ·{" "}
                <Kbd>{SHORTCUT_LABELS.paste}</Kbd> 붙여넣기 ·{" "}
                <Kbd>{SHORTCUT_LABELS.duplicate}</Kbd> 복제.
              </li>
              <li>
                붙여넣기·복제는 바로 만들지 않고 미리보기가 커서를 따라다닙니다.
                클릭한 곳에 놓이고 놓인 메쉬가 선택됩니다. 여러 개면 서로의
                간격을 유지합니다.
              </li>
              <li>
                회전·크기·머티리얼은 원본을 따르고, 이름은 새로 붙습니다.
                숨김·잠금은 따라가지 않습니다.
              </li>
              <li>
                클립보드는 에디터 안에서만 씁니다 (다른 프로그램과 공유하지
                않음).
              </li>
            </List>
          </Section>

          <Section id="file">
            <List>
              <li>
                씬은 JSON 파일(.json)로 저장합니다: 메쉬 종류, 이름,
                위치·회전·크기, 머티리얼, 숨김·잠금. 카메라 위치는 저장하지
                않습니다.
              </li>
              <li>
                <Kbd>{SHORTCUT_LABELS.save}</Kbd> 저장 ·{" "}
                <Kbd>{SHORTCUT_LABELS.saveAs}</Kbd> 다른 이름으로 저장 ·{" "}
                <Kbd>{SHORTCUT_LABELS.open}</Kbd> 열기. 새 씬은 파일 메뉴에서
                엽니다.
              </li>
              <li>
                저장 안 된 변경이 있으면 새 씬·열기 전에 묻습니다. 새 씬·열기는
                실행 취소 기록을 비웁니다.
              </li>
              <li>
                <Term>자동 저장</Term>: 저장 안 된 변경이 있으면{" "}
                {AUTOSAVE_DELAY / 1000}초 뒤(탭을 닫거나 숨기면 바로) 브라우저에
                남겨 둡니다. 다음에 열 때 복구할지 묻습니다. 여러 탭에서 동시에
                편집하면 마지막 탭의 내용만 남습니다.
              </li>
            </List>
            <h3 className="pt-2 font-medium">내보내기 (파일 메뉴)</h3>
            <List>
              <li>
                <Term>glTF(.glb)로 내보내기</Term>: Blender·게임 엔진·웹
                뷰어에서 여는 표준 3D 파일입니다. 메쉬 이름·위치·회전·크기와
                머티리얼(색·메탈릭·거칠기·발광색·불투명도·조명 무시)이
                들어갑니다. 숨긴 메쉬, 바닥 격자, 카메라·조명, 씬 설정은
                빠집니다. 이 파일은 에디터로 다시 열 수 없습니다 — 편집은 씬
                파일(.json)로 이어 갑니다.
              </li>
              <li>
                <Term>스크린샷 저장</Term>: 지금 시점을 PNG로 저장합니다. 바닥
                격자·기즈모·선택 외곽선·숨긴 메쉬는 찍히지 않습니다.
              </li>
              <li>
                파일 이름은 씬 파일 이름을 따릅니다 (예: castle.json →
                castle.glb).
              </li>
            </List>
          </Section>

          <Section id="shortcuts">
            <ShortcutGroups />
          </Section>
        </main>
      </div>
    </div>
  );
}
