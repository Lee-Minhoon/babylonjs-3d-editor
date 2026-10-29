# babylonjs-3d-editor

Next.js(App Router) + Babylon.js 기반 브라우저 3D 에디터.

## 스택

- Next.js 16 / React 19 (React Compiler 켜짐) / TypeScript strict / Tailwind v4
- Babylon.js 9: `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/inspector`
- UI: shadcn/ui (**Base UI 기반**, `components.json` style `base-mira`) + `lucide-react` 아이콘
- 패키지 매니저: **pnpm만 사용** (`packageManager` 필드로 버전 고정). npm/yarn/bun 금지, 일회성 실행은 `pnpm dlx`.

## 명령

```bash
pnpm dev        # 개발 서버
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
pnpm format     # prettier --write .
pnpm format:check
pnpm lint:naming  # 파일명·폴더명 kebab-case 검사
pnpm test       # 단위 테스트 (Vitest, 수 초)
pnpm test:e2e   # E2E (Playwright, 프로덕션 빌드를 3010 포트에 띄움, 1분 안팎)
pnpm build      # 프로덕션 빌드
```

작업을 마치기 전 `pnpm typecheck && pnpm lint && pnpm format:check && pnpm lint:naming && pnpm test`가 통과해야 한다. (Stop 훅이 typecheck·단위 테스트·이름 규칙 검사를 강제함, pre-commit은 이름 규칙·단위 테스트)
사용자가 보는 동작(입력·UI·저장/열기 등)을 바꿨으면 `pnpm test:e2e`도 돌린다.

## 테스트

- **단위 테스트(Vitest)**: `src/**/*.test.ts`, 테스트 대상 파일 옆에 둔다 (`history.ts` ↔ `history.test.ts`). Node에서 Babylon `NullEngine`으로 씬을 만든다 (`lib/test-scene.ts`의 `createTestScene`). 렌더링·포인터가 필요 없는 로직 — Command, 히스토리, 파일 형식·변환, 스냅샷, 이름 규칙, 키 판정 — 은 여기서 검사한다.
- **E2E(Playwright)**: `e2e/*.spec.ts`, 공용 도우미는 `e2e/editor.ts`. 사용자가 보는 것(씬 목록·메뉴·패널·안내 문구)으로 확인하고 Babylon 내부는 들여다보지 않는다. 파일 창은 `mockFileSystem`, 한글 입력은 `pressHangul`로 흉내 낸다. 설치된 Chrome을 쓴다 (`channel: "chrome"`).
- `lib/` 로직을 바꾸거나 고치면 단위 테스트를 같이 추가·수정한다. 버그를 고칠 땐 그 버그를 재현하는 테스트를 먼저 쓴다. 새 사용자 기능은 E2E 시나리오를 하나 이상 추가한다.
- 파일 형식(`scene-format.ts`)을 바꾸면 이전 버전 파일 변환 테스트를 반드시 추가한다.
- E2E가 간헐적으로 실패하면 재시도 횟수를 늘리지 말고 원인을 찾는다 (예: Esc 직후 blur 커밋 버그는 E2E 반복 실행에서 발견됨). 확인은 `pnpm test:e2e --repeat-each=3`.

## 포맷 / 린트

- 포맷은 **Prettier**, 코드 품질은 **ESLint**가 담당한다. ESLint에서 포맷 규칙은 `eslint-config-prettier`로 꺼져 있다.
- Prettier 설정은 기본값 + `prettier-plugin-tailwindcss`(클래스 정렬)만 쓴다. 스타일 옵션을 추가하지 말 것.
- 파일을 수정하면 PostToolUse 훅이 `eslint --fix` → Prettier 순으로 자동 실행한다. 포맷·import 정렬은 직접 맞추려 하지 말고 훅에 맡긴다. 훅이 파일을 다시 쓰므로, 이어서 같은 파일을 Edit 할 땐 최신 내용을 기준으로 한다.
- **import 정렬** (`simple-import-sort`, autofix): 사이드이펙트 → `react`/`next` → 외부 패키지 → `@/` → 상대 경로 → CSS 순, 그룹 사이 빈 줄.
- **미사용 코드** (`unused-imports`): 안 쓰는 import는 자동 제거(error). 안 쓰는 변수/인자는 warn이며, 의도적으로 안 쓰는 건 `_` 접두사를 붙인다.
  - ⚠️ import만 먼저 추가하는 Edit를 따로 하면 훅이 "미사용"으로 보고 즉시 지운다. **import와 그것을 쓰는 코드는 같은 Edit(또는 Write)에서 추가**한다.

## 폴더 규칙

```
src/
├── app/                 # 라우팅 전용 (thin): 라우트, 레이아웃, metadata, 데이터 fetch 진입점만
├── features/            # 기능 단위 모듈
│   └── editor/
│       ├── components/  # feature 전용 컴포넌트
│       ├── hooks/       # feature 전용 훅
│       ├── lib/         # feature 전용 로직 (예: mesh-presets.ts)
│       └── index.ts     # public API — feature 밖으로 공개할 것만 export
├── components/          # 공용 컴포넌트 (어느 feature에도 속하지 않음)
├── hooks/               # 공용 훅
└── lib/                 # 도메인에 종속되지 않는 외부 SDK 초기화 / 전역 인프라 유틸
    └── babylon/         # 엔진 생성, 로더 등록, 인스펙터
```

### 의존 방향 (ESLint `import/no-restricted-paths`로 강제)

`app` → `features` → 공용(`components`, `hooks`, `lib`). 역방향 import는 에러.

- 공용 코드는 `features`·`app`을 import 할 수 없다. 공용에서 필요해지면 그 코드를 공용으로 올린다.
- **feature끼리는 서로 import 할 수 없다.** 둘 다 필요한 건 공용으로 올리거나, `app`에서 두 feature를 조합한다.
- feature 밖에서는 **`index.ts`로만** import 한다: `import { Editor } from "@/features/editor"` ✅, `@/features/editor/lib/...` ❌.
- feature 내부에서는 상대 경로(`../lib/mesh-presets`)를 쓴다. index 배럴은 feature 루트에 하나만 두고 하위 폴더에는 만들지 않는다.
- 새 feature는 `src/features/<name>/` 폴더만 만들면 된다. 경계 zone은 폴더 목록으로 자동 생성된다 (`eslint.config.mjs`).

- **파일명·폴더명은 kebab-case**: `babylon-canvas.tsx`, `use-babylon-scene.ts`, `src/lib/babylon/`, `app/editor-settings/`. React 컴포넌트·훅 파일도 kebab-case (export하는 이름은 `BabylonCanvas`, `useBabylonScene` 그대로).
  - 적용 범위: `src/`, `scripts/`, `e2e/`, `.claude/hooks/` 아래의 모든 폴더·파일. 루트 설정 파일(`next.config.ts` 등)은 도구가 이름을 정하므로 제외.
  - 폴더 예외 (Next.js 라우팅 문법, 괄호/접두사 안쪽 이름은 kebab-case): `_private`, `(group)`, `[id]`, `[...slug]`, `[[...slug]]`, `@modal`, `(.)photo`/`(..)photo`/`(...)photo`.
  - `engine.test.ts`, `types.d.ts`처럼 첫 `.` 뒤의 확장자 부분은 검사하지 않는다.
  - 판정 기준과 예외 목록은 [scripts/check-naming.mjs](scripts/check-naming.mjs) 하나뿐이다. 규칙을 바꿀 땐 이 파일만 고친다.
  - 강제 지점: ESLint(`local/kebab-case-path`), Write 전 PreToolUse 훅(생성 차단), Stop 훅(전체 검사), git pre-commit(husky).
- 루트 `lib/`에는 비즈니스(에디터 기능) 로직을 넣지 않는다. "어디서든 쓸 수 있는 인프라"만. 기능 로직은 `features/<name>/lib/`.
- 한 feature에서만 쓰는 코드는 공용 폴더가 아니라 그 feature 안에 둔다. `app/` 안에 `_components` 같은 폴더를 만들지 않는다.
- import는 `@/*` (→ `src/*`) 별칭 사용.

## 에디터 구조 (`src/features/editor`)

- 도구의 변경 알림은 `createListeners()`(`src/lib/listeners.ts`), 메쉬별 알림(이름·머티리얼)은 `createKeyedListeners()`로 만든다.
- 뷰포트가 씬과 함께 도구들을 만들어 `EditorRuntime`(`{ scene, history, placement, selection, tools, clipboard, sceneFile, autosave }`)으로 UI에 넘긴다. 도구는 순수 TS 객체(`lib/`)이고, React는 `subscribe`/`getX`를 `useSyncExternalStore`로 구독만 한다. 구독 훅은 `hooks/use-editor-state.ts`(`useHistoryState`, `useSelection`, `useActivePresetId`, `useActiveTool`, `useSnap`, `useSceneFileState` …). Babylon 객체 값 구독은 `use-mesh-transform.ts`·`use-mesh-material.ts`에 모아 두고, 컴포넌트마다 다시 만들지 않는다.
- 레이아웃: 상단 `editor-header`(메뉴바: 파일/편집/추가/보기 + undo/redo), 왼쪽 `mesh-sidebar`, 가운데 뷰포트 + `transform-toolbar`, 오른쪽 `properties-panel`.
- 단축키 처리기는 입력창과 대화상자(`role=dialog/alertdialog`) 안의 키를 무시한다.
- 단축키·메뉴·버튼이 공유하는 동작은 `lib/editor-actions.ts`에 둔다 (예: `deleteSelected`). 입력 경로마다 로직을 따로 쓰지 않는다.
- 메뉴에 아직 없는 기능(예약 키)은 `PlannedItem`으로 비활성 "준비 중" 표시. 기능을 붙일 때 `MenubarItem`으로 바꾸고 단축키를 `editor-shortcuts.ts`에 연결한다.
- 활성 도구(`tools`): `select | move | rotate | scale` (Q/W/E/R). 배치 모드는 그 위에 잠깐 덮어쓰는 모드다. 기즈모는 선택된 메쉬 + move/rotate/scale + 배치 모드 아님일 때만 보인다.
- **뷰포트 포인터 입력은 `lib/pointer-router.ts` 한 곳에서만 받는다.** 우선순위: 기즈모 위/드래그 중 → 배치 모드 → 선택. 새 도구가 클릭을 받아야 하면 `scene.onPointerObservable`을 직접 구독하지 말고 라우터에 분기를 추가한다 (기즈모 클릭이 선택 해제로 새는 식의 충돌 방지).
- 기즈모 드래그는 시작/끝 스냅샷으로 **드래그 한 번 = 변형 Command 하나**를 기록한다 (`transform-command.ts`). 여러 개 선택이면 묶음 중심의 피벗(`TransformNode`)에 기즈모를 붙이고, 드래그 동안만 메쉬들을 피벗 자식으로 만들어(`setParent`) 함께 움직인 뒤 Command 하나로 묶는다. 피벗은 메쉬를 따라가지 않으므로 선택·히스토리가 바뀔 때마다 다시 놓는다. **드래그 중에는 단축키를 받지 않는다** (`gizmo.isDragging()`) — 자식인 동안 undo·삭제가 끼어들면 변형이 어긋난다.
- 위치 스냅: `tools.getActiveSnap()` (켜져 있으면 단위, 꺼져 있으면 `null`). 단위는 `SNAP_STEPS`(0.1/0.25/0.5/1, 기본 0.5, `lib/tools.ts`)에서 툴바 드롭다운·보기 메뉴로 고른다. 배치는 X/Z를 절대 격자에 맞추고(`snapValue`), 이동 기즈모는 Babylon `snapDistance`(변화량 단위)를 쓴다. 새 위치 입력 도구도 `getActiveSnap()`을 따른다.
- 속성 패널 숫자 입력(`@base-ui/react/number-field`)도 같은 원칙: `onValueChange`에서는 메쉬에 바로 적용(미리보기, 기록 없음), `onValueCommitted`에서 편집 시작 전 스냅샷과 비교해 Command 하나. Enter는 blur로 커밋, Esc는 취소. `editor-shortcuts`는 입력창을 건너뛰므로 **입력창 안의 ⌘Z/⌘⇧Z는 필드가 `handleFieldHistoryKey`로 직접 처리**한다 (편집 중이면 취소, 아니면 history undo/redo).
- 패널 표시값은 Babylon 객체를 직접 구독해서 얻는다 (`hooks/use-mesh-transform.ts`, `onAfterWorldMatrixUpdateObservable`). React state에 복사해 두지 않는다 — 기즈모·undo·입력 어디서 바뀌든 한 경로로 반영된다.
- **씬을 바꾸는 동작은 반드시 Command로 만들어 `history.execute()`로 실행**한다 (undo/redo 대상). 메쉬를 직접 `dispose()`하지 않는다 — 삭제는 `createRemoveMeshCommand`.
- 선택(`selection`)은 **여러 개**다: `getMeshes()`(고른 순서). 클릭은 하나만 선택, **Shift·⌘/Ctrl+클릭은 넣고 빼기** (뷰포트·씬 목록 같음, 판정은 `isAdditiveClick`). 속성 패널은 하나일 때만 편집하고, 여러 개면 목록만 보여준다. 선택은 히스토리에 기록하지 않는다. 선택된 메쉬가 씬에서 빠지면 선택에서도 빠진다.
- **여러 메쉬에 하는 동작은 `createMacroCommand`로 묶어 undo 한 번**이 되게 한다 (`history.ts`, 라벨은 `macroLabel` — 하나면 "Box 1 삭제", 여럿이면 "메쉬 3개 삭제"). 선택을 대상으로 하는 새 동작도 `selection.getMeshes()` 전체에 적용한다.
- 이름 바꾸기(`lib/mesh-name.ts`): 씬 목록 더블클릭(인라인) · 속성 패널 이름 칸 · F2(그 칸으로 포커스, `startRename`). 바꾸는 곳은 모두 `setMeshName`을 거치고 화면은 `useMeshName`으로 구독한다 (Babylon은 이름 변경을 알려주지 않는다 — **`mesh.name`에 직접 대입하지 않는다**). 앞뒤 공백 제거, 빈 이름 무시, 같은 이름 허용. "Box 9"처럼 번호 형식이면 다음 새 메쉬 번호가 이어진다. 한글을 입력받는 칸은 `isComposing` 중의 키를 무시한다 (조합 중 Enter).
- 클립보드(`lib/clipboard.ts`)는 에디터 내부 전용이고 여러 메쉬를 한 번에 담는다. 메쉬 객체가 아니라 **다시 만들 수 있는 데이터(`MeshSnapshot`: 프리셋·변형·머티리얼)**를 담는다 → 잘라낸 원본이 해제돼도 붙여넣을 수 있다. 복사는 히스토리에 기록하지 않고, 잘라내기는 삭제 Command. **붙여넣기·복제는 바로 만들지 않고 배치 모드(`placement.startSnapshot`)로 들어간다** — 원본의 회전·크기를 입힌 미리보기가 커서를 따라다니고(여러 개면 서로의 위치 관계를 유지한 묶음 — 기준점은 첫 메쉬의 X/Z와 묶음 밑면), 클릭 한 번에 놓인 뒤(Command 하나, undo 가능) 놓은 메쉬들이 선택되며 모드가 끝난다. 프리셋 배치(`toggle`)는 Esc까지 계속 놓는다. 배치 중 R/⇧R로 미리보기를 월드 Y축 90°씩 돌리고(복사본은 원본 회전 위에 더함), 돌릴 때마다 밑면 높이를 다시 잰다. 프리셋을 바꿔도 각도는 유지된다. 새로 메쉬를 만드는 동작은 `createSpawnMeshCommand`를 쓰고, 만든 메쉬는 `getMesh()`로 받는다. 배치 중인지는 `placement.isActive()`로 판단한다 (`getActivePresetId()`는 프리셋 배치일 때만 값이 있다). 메쉬에 새 속성을 추가하면 `MeshSnapshot`에도 넣어야 복사된다.
- 머티리얼은 **PBR(metallic-roughness)만 지원**한다 (`lib/mesh-material.ts`, glTF와 같은 방식). 메쉬마다 `PBRMaterial` 하나 (공유 머티리얼 없음). 값은 `MaterialValues`(`color` sRGB hex · `metallic` · `roughness`)이고 머티리얼엔 선형 공간으로 넣는다. StandardMaterial은 에디터 내부 표시용(배치 미리보기 등)에만 쓴다.
  - 머티리얼 값을 바꾸는 곳(미리보기·Command·파일 열기)은 모두 `applyMaterialValues`를 거친다 → 패널은 `useMeshMaterial`(`onMaterialChange`)로 구독. 머티리얼 속성을 직접 대입하지 않는다.
  - 패널 편집은 변형 입력과 같은 원칙: 고르는 중·드래그 중은 미리보기, 커밋(색상 창 닫기·슬라이더 놓기·hex Enter)에서 `createMaterialCommand` 하나.
  - PBR 반사용 환경 텍스처는 `public/environments/studio.env` (CC BY 4.0, `NOTICE.md`). 없으면 금속이 검게 보인다.
  - shadcn `Slider`에는 `value={[n]}`처럼 배열로 넘긴다 (숫자 하나면 thumb이 두 개 그려진다).
- 씬 파일: 형식은 `lib/scene-format.ts`(에디터 전용 JSON — 프리셋·이름·위치·회전(도)·크기·색만, `format`/`version` 필드), 문서 상태(파일 이름·핸들·저장 안 된 변경·새 씬/열기/저장)는 `lib/scene-file.ts`. 브라우저 파일 입출력은 공용 `src/lib/file-access.ts`(File System Access API, 없으면 input/다운로드 폴백).
  - **새 씬·열기는 히스토리를 비운다** (undo 대상 아님, Command 예외). 이때만 에디터 메쉬를 직접 해제한다 (`clearEditorMeshes`, 반드시 `history.clear()` 뒤).
  - 변경 여부는 저장 시점의 `history.peek()`와 비교한다 (undo로 저장 시점에 돌아오면 깨끗한 상태). 변경이 있으면 `DiscardChangesDialog`로 묻는다 (`confirmPending` → `resolveConfirm`).
  - 열기는 파싱·검증(`parseSceneFile`)이 성공한 뒤에만 씬을 바꾼다. 실패 메시지(`SceneFileError`)는 토스트로 보여준다.
  - 자동 저장(`lib/autosave.ts`): 파일로 저장 안 된 변경이 있으면 1초 뒤(탭이 숨겨지면 즉시) IndexedDB(`src/lib/kv-store.ts`)에 씬 텍스트를 남기고, 깨끗해지면 지운다. 시작할 때 기록이 있으면 `RecoveryDialog`로 복구/버리기를 묻고, **답을 받기 전에는 아무것도 쓰지 않는다** (빈 씬이 기록을 지우지 않게). 복구는 `sceneFile.restore` — 히스토리는 비우고, 파일로 저장할 때까지 "변경 있음"으로 둔다. 파일 핸들은 복구하지 않는다(첫 저장 때 위치를 다시 묻는다). 저장소는 하나라 여러 탭에서 동시에 편집하면 마지막 탭 내용만 남는다.
  - 형식을 바꾸면 `SCENE_FILE_VERSION`을 올리고 이전 버전 변환을 `parseSceneFile`에 넣는다. 메쉬에 새 속성을 추가하면 `MeshSnapshot`과 씬 파일 둘 다에 넣는다.
- **키보드 단축키는 `lib/editor-shortcuts.ts` 한 곳에서만 등록**한다. 도구에서 `window.addEventListener("keydown")`을 직접 달지 않는다 (같은 키의 우선순위가 등록 순서에 묶이기 때문). 현재 키 목록은 그 파일 상단 주석이 기준이다.
  - 사용 중: Esc · Delete/Backspace · Q/W/E/R(도구) · R/⇧R(배치 중일 때만 미리보기 90° 회전 — 크기 도구보다 우선, `placement.rotate`) · 1~8(메쉬 프리셋, `MESH_PRESETS` 순서, 상단 숫자열만) · ⌘Z/⌘⇧Z/Ctrl+Y · ⌘C/⌘X/⌘V(복사/잘라내기/붙여넣기) · ⌘D(복제, 브라우저 북마크는 항상 막음) · F2(이름 바꾸기) · ⌘S/⌘⇧S(저장/다른 이름으로 저장) · ⌘O(열기). 새 씬은 단축키 없음(⌘N은 브라우저가 가로챔).
  - **예약 — 다른 기능에 쓰지 않는다:** ⌘/Ctrl+A(전체 선택), F(선택 메쉬 포커스), 숫자패드(카메라 시점).
  - 키를 누르고 있을 때의 반복 입력(`event.repeat`)은 undo/redo와 배치 회전(R)만 받는다 (숫자 키를 누르고 있으면 배치가 켜졌다 꺼지는 것을 막는다). 누르고 있는 동안 반복돼야 하는 새 단축키는 `repeatable`에 추가한다.
  - **키 판정은 `getShortcutKey(event)`로 한다** (`event.key` 직접 비교 금지). 글자 키를 `event.code`(물리 키 위치)로 봐서 한글 입력 상태(Q → "ㅂ")에서도 같은 단축키가 동작한다. 입력창 안에서 ⌘Z 등을 직접 처리하는 컴포넌트도 같은 함수를 쓴다.
  - 단축키를 UI에 보여줄 땐 하드코딩하지 말고 `editor-shortcuts.ts`에서 가져온다: `getPresetShortcut`, `getToolShortcut`, `SHORTCUT_LABELS`(undo/redo/delete/save/open/예약 키 등).
  - 메뉴의 라디오·체크박스 항목엔 `closeOnClick`을 준다 (Base UI 기본값은 안 닫힘 → 다음 키 입력이 메뉴로 빨려 들어간다).
- 뷰포트 클릭은 `POINTERTAP`으로 처리한다 (드래그 = 카메라 조작·기즈모 드래그와 구분).

## UI 규칙 (shadcn / Base UI)

- UI는 `@/components/ui`의 shadcn 컴포넌트로 만든다. `src/features`·`src/app`에서 네이티브 `<button>`, `<input>`, `<select>`, `<textarea>`는 ESLint 에러 → `Button`, `Input`, `NativeSelect`, `Textarea`.
- **Base UI 기반이다. Radix 문법을 쓰지 않는다.**
  - 다른 요소로 렌더링할 땐 `asChild`가 아니라 **`render` prop**: `<TooltipTrigger render={<Button variant="secondary" />}>내용</TooltipTrigger>` (`asChild`는 ESLint 에러).
  - `radix-ui`, `@radix-ui/*` import 금지 (ESLint 에러). primitive가 필요하면 `@base-ui/react/<component>`.
- 색은 하드코딩(`zinc-800` 등)하지 말고 테마 토큰을 쓴다: `bg-background`, `bg-sidebar`, `text-muted-foreground`, `border-sidebar-border`, `bg-sidebar-accent` … (`src/app/globals.css`). 앱은 `<html class="dark">`로 다크 테마 고정.
- 아이콘은 `lucide-react`. 아이콘만 있는 버튼엔 `aria-label`, 장식용 아이콘엔 `aria-hidden`.
- 툴팁은 `Tooltip`(+ 단축키는 `Kbd`). 브라우저 `title` 속성으로 대신하지 않는다. `TooltipProvider`는 `Editor` 루트에 있다.
- `components/ui/*`는 우리가 소유한 코드다 (필요하면 수정 가능). **`pnpm dlx shadcn@latest add <name>`으로 추가한 뒤에는 `pnpm format && pnpm lint:fix`를 실행**한다 — CLI가 쓴 파일은 편집 훅을 거치지 않아 import 정렬·포맷이 맞지 않는다.

## Babylon.js 규칙

- **딥 import만 사용**: `import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"`.
  - `@babylonjs/core` 배럴 import 금지 (번들 크기).
  - `.pure` 경로 금지: 사이드이펙트(셰이더, 엔진 확장 등록)가 빠져서 런타임에 깨진다.
  - `MeshBuilder` 대신 `CreateBox` 등 개별 빌더 함수 (`@babylonjs/core/Meshes/Builders/*`).
- **브라우저 전용**: Babylon을 쓰는 파일은 `"use client"`. 엔진/씬 생성은 effect 안에서만 (SSR/프리렌더 시 실행되면 안 됨).
- **엔진**: 직접 `new Engine()` 하지 말고 `createEngine()` (`lib/babylon/engine.ts`) 사용. WebGPU 우선, 실패 시 WebGL 폴백이며 **비동기**다.
- **씬 생명주기**: `useBabylonScene` / `<BabylonCanvas onSceneReady>` 사용. `onSceneReady`에서 등록한 리스너·리소스는 반환하는 cleanup 함수에서 해제한다. scene/engine dispose는 훅이 처리.
- **로더**: `ensureLoadersRegistered()`가 훅에서 호출됨. 포맷별 로더를 직접 import 하지 않는다.
- **Inspector**: `lib/babylon/inspector.ts`를 통해서만 동적 로드 (개발 모드 전용, Shift+Alt+I). 정적 import 금지.
