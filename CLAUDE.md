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
- E2E에서 메뉴를 닫을 땐 `closeMenu`(열린 메뉴가 포커스를 가져간 뒤 Esc, 다 닫힐 때까지 대기), 실행 취소 라벨은 `undoMenuText`를 쓴다. `click()` 직후 바로 Esc를 누르면 메뉴가 아직 열리는 중이라 Esc가 트리거에서 에디터로 가 선택을 풀고, 닫히는 중인 메뉴의 항목도 locator에 잡힌다 (열림은 `[role=menu][data-open]`으로 본다).
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
- 도구들은 **`lib/editor-runtime.ts`의 `createEditorRuntime(scene, camera, { notify, autosaveStorage })`** 한 곳에서 만들어 서로 잇고, 돌려주는 `dispose()`가 만든 역순으로 해제한다 (NullEngine 단위 테스트 가능 — 새 도구는 여기에 추가하고 해제 순서도 여기서 맞춘다). 뷰포트 컴포넌트는 씬 꾸미기(카메라·기본 조명·격자)와 브라우저 배선(단축키·탭 숨김 자동 저장·인스펙터·컨텍스트 메뉴)만 하고, 런타임 `EditorRuntime`(`{ scene, cameraView, boxSelect, gizmo, help, addMenu, contextMenu, sceneExport, history, placement, selection, tools, clipboard, sceneFile, autosave }`)을 UI에 넘긴다. 타입은 lib에 있다 — 훅·컴포넌트는 `../lib/editor-runtime`에서 import 한다 (컴포넌트 파일에서 가져오지 않는다). 도구는 순수 TS 객체(`lib/`)이고, React는 `subscribe`/`getX`를 `useSyncExternalStore`로 구독만 한다. 구독 훅은 `hooks/use-editor-state.ts`(`useHistoryState`, `useSelection`, `useActivePresetId`, `useActiveTool`, `useSnap`, `useSceneFileState` …). Babylon 객체 값 구독은 `use-mesh-transform.ts`·`use-property.ts`에 모아 두고, 컴포넌트마다 다시 만들지 않는다.
- **값 묶음 속성(머티리얼·조명·모양·씬 설정)은 `lib/editable-property.ts`로 만든다** (`createMeshProperty` / 대상이 씬이면 `createEditableProperty`): `read`·`write`·`isSame`만 주면 `get`·`apply`(쓰고 알림)·`onChange`·`createCommand`("Box 1 머티리얼")가 한 벌로 나온다 (`materialProperty`·`lightProperty`·`shapeProperty`·`sceneSettingsProperty`). 값을 바꾸는 곳은 모두 `apply`를 거치고(대상 속성에 직접 대입하지 않는다), 패널은 `usePropertyValues(property, meshes)`로 구독하고 `usePropertyEdit(property, meshes, history)`로 미리보기→커밋한다. 새 속성을 추가하면 이 틀을 쓰고 `MeshSnapshot`·씬 파일에도 넣는다. `onChange` 구독은 반드시 해제한다 — 키드 리스너는 대상을 강한 참조로 붙잡는다 (훅은 자동, 도구에서 구독하면 조명의 숨김 구독처럼 `mesh.onDisposeObservable`에 해제를 건다).
- 레이아웃: 상단 `editor-header`(메뉴바: 파일/편집/추가/객체/보기 + undo/redo), 왼쪽 `mesh-sidebar`, 가운데 뷰포트 + `transform-toolbar`, 오른쪽 `properties-panel`(아래에 `history-panel`).
- 히스토리 패널(`history-panel.tsx`): `HistoryState.entries`(남은 기록 라벨, 오래된 것부터 — 되돌린 것 포함)·`position`(적용된 개수)을 보여주고, 항목을 누르면 `history.goTo(n)`(여러 단계를 한 번에, 알림 한 번). 맨 위 "시작"이 0.
- 단축키 처리기는 입력창, 슬라이더, **열려 있는**(`data-open`) 메뉴·리스트박스·대화상자(`role=dialog/alertdialog`) 안의 키를 무시한다 (`SHORTCUT_FREE_ZONE`·`POPUP_ZONE`). 닫히는 중인 팝업에는 포커스가 잠깐 남으므로 열림 여부를 꼭 본다 (Esc 직후 ⌘Z가 먹히지 않는 버그, 도움말 창을 닫자마자 누른 Q가 무시되는 버그). 글자 키로 항목을 찾거나 화살표로 값을 바꾸는 UI를 새로 붙이면 거기에 role을 추가한다.
- 단축키·메뉴·버튼이 공유하는 동작은 `lib/editor-actions.ts`에 둔다 (예: `deleteSelected`). 입력 경로마다 로직을 따로 쓰지 않는다.
- 활성 도구(`tools`): `select | move | rotate | scale` (Q/W/E/R). 배치 모드는 그 위에 잠깐 덮어쓰는 모드다. 기즈모는 선택된 메쉬 + move/rotate/scale + 배치 모드 아님일 때만 보인다.
- **뷰포트 포인터 입력은 `lib/pointer-router.ts` 한 곳에서만 받는다.** 우선순위: 기즈모 위/드래그 중 → 배치 모드 → 박스 선택 드래그 → 선택. 새 도구가 클릭을 받아야 하면 `scene.onPointerObservable`을 직접 구독하지 말고 라우터에 분기를 추가한다 (기즈모 클릭이 선택 해제로 새는 식의 충돌 방지).
- 기즈모 드래그는 시작/끝 스냅샷으로 **드래그 한 번 = 변형 Command 하나**를 기록한다 (`transform-command.ts`). 여러 개 선택이면 묶음 중심의 피벗(`TransformNode`)에 기즈모를 붙이고, 드래그 시작 때 메쉬마다 피벗 기준 행렬을 기억해 매 프레임(`onBeforeRender`) 피벗을 따라 다시 계산해(`followPivot`, 부모가 있으면 부모 기준 값으로) 함께 움직인 뒤 Command 하나로 묶는다 — 부모는 바꾸지 않는다. 부모와 자식을 함께 골랐으면 부모만 옮긴다(`topLevelOnly`). 피벗은 메쉬를 따라가지 않으므로 선택·히스토리가 바뀔 때마다 다시 놓는다. **드래그 중에는 단축키를 받지 않는다** (`gizmo.isDragging()`) — 시작 자세 기준으로 따라가는 중에 undo·삭제가 끼어들면 변형이 어긋난다. 알려진 한계: 여러 개를 회전·크기 조절할 때 비균일 크기 메쉬는 전단이 생겨 TRS로 근사된다 (이동은 정확). 변형 비교(`isSameTransform`)는 숫자가 아니라 "같은 자세"(epsilon·쿼터니언)로 하고, 움직이지 않은 드래그는 기록하지 않고 시작 값을 복원한다 — 행렬 분해(`decomposeTransform`)는 값을 비트 단위로 보존하지 않는다. `captureTransform`은 메쉬 자신의 값(부모 기준), 월드 값은 `captureWorldTransform`.
- 계층(`lib/mesh-hierarchy.ts`): 에디터 객체(메쉬·조명)는 다른 에디터 객체의 자식이 될 수 있다 (`mesh.parent`). 자식의 변형 값은 **부모 기준**(패널·파일·Command 모두), 패널은 부모 이름을 알린다. 부모 바꾸기는 모두 `setMeshParent`를 거치고(`mesh.parent`에 직접 대입하지 않는다 — 씬 목록은 `useMeshHierarchy`로 구독), 편집은 `createParentCommand`/`createSetParentCommand`(월드 자세 유지, 자기 자신·자손 아래는 안 됨, 라벨 "Box 1 부모 지정"/"부모 해제"). 입력: 씬 목록 끌어 놓기(줄 위 = 그 자식, 빈 곳 = 최상위, 고른 줄을 끌면 고른 것 모두 — `setParentOf`) · P(마지막에 고른 것이 부모, `parentSelected`) · ⌥P(해제) · 객체 메뉴. 씬 목록은 `buildSceneTree`로 들여 쓰고 접기/펴기(UI 상태, 뷰포트에서 접힌 자식을 고르면 펼침). 부모를 옮기면 자식이 따라가므로 **선택을 대상으로 하는 이동·삭제·복사·정렬은 `topLevelOnly`로 거른다**. 삭제·추가 undo는 자손까지 함께 떼고 붙인다(뗄 때 씬에 있는 자손만 — 먼저 따로 지운 자식이 되살아나지 않게). 복사본(`MeshSnapshot.children`)은 자식까지, 맨 위는 월드 자세로 최상위에. 정렬·바닥에 붙이기는 월드 이동량을 부모 기준으로 바꿔 넣는다. 숨김·잠금은 물려받지 않는다. glTF는 내보내지 않는 부모(숨김·조명) 아래 메쉬를 내보내는 동안만 가까운 조상으로 옮겨 월드 자리를 지킨다. 알려진 한계: 비균일 크기 부모 아래에서 돌린 자식은 부모를 바꿀 때 TRS로 근사된다.
- 메쉬 프리셋(`lib/mesh-presets.ts`)은 원점에 만들기만 한다 (`addPresetMesh(scene, preset, material?, name?, shape?)`). 프리셋마다 모양 파라미터 정의 `params`(`ShapeParamDef`: 범위·기본값·정수 여부 — 슬라이더와 파일 검증이 같이 쓴다)와 검색어 `keywords`(한글 이름)가 있다. 기본값은 예전 모양과 같게 둔다. 빠진 키 채우기는 `shapeParamsOf`.
- 모양 바꾸기(`lib/mesh-shape.ts`): `applyShapeParams`가 같은 빌더로 임시 메쉬를 만들어 **같은 메쉬의 정점만** 바꾼다 (메쉬를 새로 만들지 않음 — 선택·이름·머티리얼·Command가 이어진다). 바꾸는 곳은 모두 이 함수를 거치고 화면은 `usePropertyValues(shapeProperty, …)`로 구독, 편집은 `createShapeCommand`("Box 1 모양"). 값은 메타데이터(`getShapeParams`)에 있고 `MeshSnapshot.shape`·씬 파일 `shape`에 들어간다. 패널의 "모양"은 고른 메쉬가 모두 같은 프리셋일 때만(`sharedShapePreset`).
- 조명(`lib/editor-lights.ts`): 방향광·점광원·스포트는 **프리셋**(`LIGHT_PRESETS`, `preset.light`, `lift`로 표면 위에 띄워 배치)이고, 에디터 객체는 뷰포트의 작은 아이콘 메쉬다 — 실제 Babylon 조명은 그 자식(아이콘의 -Y로 비춤). 그래서 선택·기즈모·이름·숨기기(=조명 끄기)·잠금·삭제·복사·undo·씬 목록이 메쉬 경로 그대로다. 조명인지는 `isLightObject`. 아이콘은 스크린샷·glTF(`getExportMeshes`)·배치 표면·바닥에 붙이기·그림자 드리우기에서 뺀다. 만들기는 `addPresetObject`(메쉬/조명 분기 — 배치·붙여넣기·파일 열기가 쓴다). 씬에서 떼고 붙이는 건 `detachFromScene`·`attachToScene`(mesh-commands) — Babylon `onNewMeshAddedObservable`은 다음 틱에 와서 빠른 undo/redo에서 순서가 꼬이므로 쓰지 않는다. 값(`LightValues`: 색·세기·범위·각도(도)·그림자)은 `applyLightValues`를 거치고 `usePropertyValues(lightProperty, …)`로 구독, 편집은 `createLightCommand`("Point Light 1 조명"). 종류별 항목은 `LIGHT_FIELDS`, 범위는 `LIGHT_RANGES`. 그림자: 켠 조명마다 `ShadowGenerator`(PCF), 드리우는 목록은 매 프레임 보이는 에디터 메쉬, 바닥은 격자 위의 `ShadowOnlyMaterial` 판(첫 그림자 조명만). 씬 전체 기본 조명(반구광 `AMBIENT_LIGHT_NAME`)은 에디터 객체가 아니라 씬 설정 `ambientIntensity`.
- 우클릭 메뉴(`lib/context-menu.ts` + `context-menu-popup.tsx`): 상태(종류·화면 좌표·캔버스 좌표)만 lib에 두고 항목은 `editor-actions`를 부른다. 뷰포트는 `pointer-router`가 **오른쪽 탭**에만 연다(오른쪽 드래그는 카메라 팬, 배치 중 우클릭은 배치 종료) — 브라우저 `contextmenu` 이벤트로 열지 않는다(맥은 누르는 순간 와서 팬과 겹친다). 객체 위면 안 골라져 있을 때만 그것만 고르고 "선택 메뉴"(선택 전체 대상), 빈 곳이면 "씬 메뉴"(추가…는 그 캔버스 좌표로 ⇧A 검색창). 씬 목록 줄은 `onContextMenu`에서 같은 규칙으로 연다. 트리거가 없는 메뉴라 가상 기준점(`anchor`)에 붙이고 `finalFocus={false}` — 닫히며 포커스를 되돌리면 "추가…"·"이름 바꾸기"가 옮긴 포커스를 뺏는다. 메뉴바와 같은 동작을 넣을 땐 두 곳 모두에 항목을 둔다.
- 검색형 추가 메뉴(⇧A, `lib/add-menu.ts` + `add-menu-popup.tsx`): 커서가 캔버스 위면 그 자리(`scene.pointerX/Y`), 아니면 가운데. 항목은 `ADD_MENU_ITEMS`(지금은 프리셋), 검색은 `searchAddMenu`(이름·`keywords`, 이름 시작 → 검색어 시작 → 포함 순). 고르면 `startPresetPlacement`(이미 그 프리셋이면 유지 — `toggle`과 다름). 조명·모델이 생기면 여기에 항목을 더한다. 바닥에 놓을 높이는 배치 도구가 미리보기의 바운딩 박스로 잰다 — 프리셋에 높이 값을 따로 두지 않는다.
- 씬 파일 텍스트의 숫자 배열 한 줄 접기(`stringifySceneFile`)는 줄 첫머리의 `"키": [` 꼴만 맞춘다. 문자열 값(이름)까지 바꾸는 정규식은 쓰지 않는다.
- 스냅: `tools.getActiveSnap(kind)` — `kind`는 `move`(위치) · `rotate`(도) · `scale`(배율 변화량). 켜기/끄기는 셋이 함께, 단위는 종류별로 따로 (`SNAP_STEPS`·`DEFAULT_SNAP_STEPS`, `lib/tools.ts`). 툴바 드롭다운은 지금 도구의 종류를 보여주고(`snapKindForTool`, 선택 도구는 이동), 보기 메뉴엔 셋 다 있다. 표시 문자열은 `formatSnapStep`. 배치는 X/Z를 절대 격자에 맞추고(`snapValue`), 기즈모는 Babylon `snapDistance`(변화량 단위 — 회전은 라디안으로 바꿔 넣고, 크기는 `incrementalSnap`으로 1 → 1.1 → 1.2)를 쓴다. 배치 중 R 회전은 스냅과 무관하게 90°. 새 위치 입력 도구도 `getActiveSnap("move")`를 따른다.
- 기즈모 축(`tools.getGizmoSpace()`): `local`(기본, 메쉬 자신의 축) / `world`. 이동·회전 기즈모의 `updateGizmoRotationToMatchAttachedMesh`로 적용한다. 크기 기즈모는 Babylon이 월드 축을 지원하지 않아 항상 로컬. 여러 개 선택 피벗은 로컬이면 처음 고른 메쉬의 회전을 따른다.
- 숨기기·잠금(`lib/mesh-flags.ts`): 씬 목록의 눈·자물쇠, 객체 메뉴, H(숨기기)/⌥H(모두 보이기). 바꾸는 곳은 모두 `setMeshFlag`를 거치고 화면은 `useMeshFlag`·`useMeshFlagCount`로 구독한다 (이름과 같은 방식 — `mesh.isVisible`에 직접 대입하지 않는다). 둘 다 Command(`createMeshFlagCommand`)라 undo 대상이고 씬 파일에 저장된다.
  - 숨김 = `isVisible=false`. 선택할 수 없고(`selection.set`이 걸러냄, 숨기면 선택에서 빠짐), 배치 표면·바닥에 붙이기 대상도 아니다.
  - 잠금 = 뷰포트 클릭·⌘A로 못 고른다 (Unity의 pickability). 씬 목록으로는 고르고 편집할 수 있다. `isPickable`은 건드리지 않는다 — 잠근 바닥판 위에도 배치·바닥에 붙이기가 돼야 한다. 뷰포트에서 고를 수 있는지는 `isPickableInViewport`.
  - 복사·복제본에는 따라가지 않는다 (`MeshSnapshot`에 넣지 않음 — 새 메쉬는 늘 보이고 풀려 있다).
  - 씬 목록 토글 버튼엔 `aria-pressed`를 쓰지 않고 상태별 라벨("Box 1 숨기기"/"Box 1 보이기")을 쓴다. 목록의 `aria-pressed`는 "선택됨"이다.
- 바닥에 붙이기(End)·정렬·분배(`lib/mesh-align.ts`, 객체 메뉴): 위치만 옮기는 변형 Command를 묶는다. 기준은 월드 AABB. 바닥에 붙이기는 박스 가운데 높이에서 아래로 광선 5개를 쏴 맞은 윗면(법선 y ≥ 0.7) 중 가장 높은 곳, 없으면 y=0에 밑면을 맞춘다. 함께 고른 메쉬는 낮은 것부터 차례로 붙인다(옮긴 뒤 `computeWorldMatrix(true)` — 피킹은 캐시된 행렬을 쓴다). 정렬은 선택 전체 박스의 최소·가운데·최대(2개 이상), 분배는 양 끝을 두고 중심을 같은 간격으로(3개 이상). 움직이지 않는 메쉬는 기록에서 빠진다.
- 마우스 배치(`lib/camera-controls.ts`): 왼쪽 드래그 회전(선택 도구에선 박스 선택, ⌥+드래그가 회전) · Shift+왼쪽 드래그 박스 선택(모든 도구, 선택에 더함) · ⌃+왼쪽/오른쪽/가운데 드래그 팬 · 휠·핀치 줌. 카메라는 Babylon 9 `camera.movement.input.inputMap`의 포인터 규칙을 도구·배치 상태에 따라 바꿔 정하고(맞는 규칙이 없으면 카메라가 안 움직임), 박스 선택 시작 판정 `isBoxSelectDrag`도 같은 파일에 둔다 — 둘이 어긋나면 한 드래그가 카메라도 돌리고 박스도 그린다. 카메라 포인터 입력을 직접 붙이거나 떼지 말고 이 규칙을 고친다.
- 박스 선택(`lib/box-select.ts`, 화면은 `selection-box.tsx`): 좌표는 캔버스 기준 CSS 픽셀(`scene.pointerX/Y`). Babylon 탭 판정 거리(`InputManager.DragMovementThreshold`)를 넘게 움직여야 박스가 된다 — 한 누름이 탭(클릭 선택)과 박스로 두 번 처리되지 않게. 판정(`meshesInRect`)은 바운딩 박스로 거르고 → 정점이 사각형 안에 있는지 → 없으면 사각형 가운데 피킹. 숨기거나 잠근 메쉬는 고르지 않는다. 행렬은 `getTransformationMatrix()`(마지막 렌더 값) 대신 지금 view×projection으로 만든다.
- 시점·직교(`lib/camera-views.ts`): 숫자패드 1/3/7 정면/오른쪽/위(⌃: 뒤/왼쪽/아래), 5 원근↔직교, 보기 메뉴 "시점"·"직교 투영"(숫자패드 없는 키보드용). 시점은 alpha·beta만 바꾸고(가장 짧은 쪽으로 돈다), 위·아래는 카메라 beta 한계까지. 직교 범위는 매 프레임 `radius·tan(fov/2)`로 맞춰 원근과 같은 크기로 보이고 휠 줌이 그대로 된다. 포커스·시점 애니메이션은 `animateCamera`(`camera-focus.ts`) 하나를 쓴다 (새 애니메이션이 진행 중인 것을 멈춤). 숫자패드는 `event.code`로 보고 다른 키보다 먼저 처리한다 — Num Lock이 꺼지면 `event.key`가 "End"·"Home"이다.
- 메뉴를 쓰고 나면 포커스가 메뉴바 트리거에 남는다. Base UI 메뉴바는 Home/End를 자기 이동 키로 쓰므로 End·숫자패드는 `passEditorKeys`(`editor-header.tsx`, `preventBaseUIHandler`)로 에디터에 넘긴다. 새 단축키가 메뉴바 키(화살표·Home·End·Enter·Space)와 겹치면 여기도 고친다.
- 카메라 포커스(F·보기 메뉴, `lib/camera-focus.ts`): 방향(alpha·beta)은 두고 target·radius만 옮긴다 (줌 한계 안, 0.25초 애니메이션, 모션 줄이기 설정이면 즉시). ArcRotateCamera의 `target` 세터는 각도를 다시 계산하므로 `camera.target.copyFrom()`을 쓴다. 히스토리에 기록하지 않는다.
- 속성 패널 숫자 입력(`@base-ui/react/number-field`)도 같은 원칙: `onValueChange`에서는 메쉬에 바로 적용(미리보기, 기록 없음), `onValueCommitted`에서 편집 시작 전 스냅샷과 비교해 Command 하나. Enter는 blur로 커밋, Esc는 취소. `editor-shortcuts`는 입력창을 건너뛰므로 **입력창 안의 ⌘Z/⌘⇧Z는 필드가 `handleFieldHistoryKey`로 직접 처리**한다 (편집 중이면 취소, 아니면 history undo/redo).
- 패널 표시값은 Babylon 객체를 직접 구독해서 얻는다 (`hooks/use-mesh-transform.ts`, `onAfterWorldMatrixUpdateObservable`). React state에 복사해 두지 않는다 — 기즈모·undo·입력 어디서 바뀌든 한 경로로 반영된다.
- **씬을 바꾸는 동작은 반드시 Command로 만들어 `history.execute()`로 실행**한다 (undo/redo 대상). 메쉬를 직접 `dispose()`하지 않는다 — 삭제는 `createRemoveMeshCommand`.
- 선택(`selection`)은 **여러 개**다: `getMeshes()`(고른 순서). 클릭은 하나만 선택, **Shift·⌘/Ctrl+클릭은 넣고 빼기** (뷰포트·씬 목록 같음, 판정은 `isAdditiveClick`). 속성 패널은 여러 개도 함께 편집한다 (이름 제외): 변형은 입력한 축만 모두 같은 값, 머티리얼은 바꾼 필드만 각자의 값 위에(`usePropertyEdit`), 달라진 메쉬들을 `createMacroCommand` 하나로. 값이 서로 다르면 "—"(`MIXED_LABEL`, 판정은 `sharedValue`·`sharedAxisValue`). 구독 훅은 메쉬 배열을 받는다(`useMeshTransforms`·`usePropertyValues`) — 넘기는 배열은 선택 배열처럼 안정적이어야 한다(매 렌더 새 배열이면 스토어가 다시 만들어진다). 선택은 히스토리에 기록하지 않는다. 선택된 메쉬가 씬에서 빠지면 선택에서도 빠진다.
- **여러 메쉬에 하는 동작은 `createMacroCommand`로 묶어 undo 한 번**이 되게 한다 (`history.ts`, 라벨은 `macroLabel` — 하나면 "Box 1 삭제", 여럿이면 "메쉬 3개 삭제"). 선택을 대상으로 하는 새 동작도 `selection.getMeshes()` 전체에 적용한다.
- 이름 바꾸기(`lib/mesh-name.ts`): 씬 목록 더블클릭(인라인) · 속성 패널 이름 칸 · F2(그 칸으로 포커스, `startRename`). 바꾸는 곳은 모두 `setMeshName`을 거치고 화면은 `useMeshName`으로 구독한다 (Babylon은 이름 변경을 알려주지 않는다 — **`mesh.name`에 직접 대입하지 않는다**). 앞뒤 공백 제거, 빈 이름 무시, 같은 이름 허용. "Box 9"처럼 번호 형식이면 다음 새 메쉬 번호가 이어진다. 한글을 입력받는 칸은 `isComposing` 중의 키를 무시한다 (조합 중 Enter).
- 클립보드(`lib/clipboard.ts`)는 에디터 내부 전용이고 여러 메쉬를 한 번에 담는다. 메쉬 객체가 아니라 **다시 만들 수 있는 데이터(`MeshSnapshot`: 프리셋·변형·머티리얼·자식)**를 담는다 → 잘라낸 원본이 해제돼도 붙여넣을 수 있다. 복사는 히스토리에 기록하지 않고, 잘라내기는 삭제 Command. **붙여넣기·복제는 바로 만들지 않고 배치 모드(`placement.startSnapshot`)로 들어간다** — 원본의 회전·크기를 입힌 미리보기가 커서를 따라다니고(여러 개면 서로의 위치 관계를 유지한 묶음 — 기준점은 첫 메쉬의 X/Z와 묶음 밑면), 클릭 한 번에 놓인 뒤(Command 하나, undo 가능) 놓은 메쉬들이 선택되며 모드가 끝난다. 프리셋 배치(`toggle`)는 Esc까지 계속 놓는다. 배치 중 R/⇧R로 미리보기를 월드 Y축 90°씩 돌리고(복사본은 원본 회전 위에 더함), 돌릴 때마다 밑면 높이를 다시 잰다. 프리셋을 바꿔도 각도는 유지된다. 새로 메쉬를 만드는 동작은 `createSpawnMeshCommand`를 쓰고, 만든 메쉬는 `getMesh()`로 받는다. 배치 중인지는 `placement.isActive()`로 판단한다 (`getActivePresetId()`는 프리셋 배치일 때만 값이 있다). 메쉬에 새 속성을 추가하면 `MeshSnapshot`에도 넣어야 복사된다.
- 머티리얼은 **PBR(metallic-roughness)만 지원**한다 (`lib/mesh-material.ts`, glTF와 같은 방식). 메쉬마다 `PBRMaterial` 하나 (공유 머티리얼 없음). 값은 `MaterialValues`(`color`·`emissive` sRGB hex · `metallic` · `roughness` · `alpha` · `unlit`, 색 외 기본값은 `MATERIAL_DEFAULTS`)이고 색은 머티리얼에 선형 공간으로 넣는다. `alpha`가 1보다 작으면 알파 블렌드(메쉬 단위 정렬 — 서로 파고든 반투명 메쉬는 순서가 어긋날 수 있음). `unlit`은 Babylon PBR `unlit`(= glTF KHR_materials_unlit) — 메탈릭·거칠기는 안 쓰이지만 발광색은 더해진다. StandardMaterial은 에디터 내부 표시용(배치 미리보기 등)에만 쓴다.
  - 머티리얼 값을 바꾸는 곳(미리보기·Command·파일 열기)은 모두 `applyMaterialValues`를 거친다 → 패널은 `usePropertyValues(materialProperty, …)`로 구독. 머티리얼 속성을 직접 대입하지 않는다.
  - 패널 편집은 변형 입력과 같은 원칙: 고르는 중·드래그 중은 미리보기, 커밋(색상 창 닫기·슬라이더 놓기·hex Enter·스위치·셀렉트)에서 `createMaterialCommand` 하나. 미리보기→커밋 흐름은 `hooks/use-property-edit.ts`, 색·슬라이더 입력은 `components/value-fields.tsx`(`ColorField`·`SliderField`)를 쓴다 (씬 설정과 공유). 섹션의 ⌘Z 처리(`handleFieldHistoryKey`)는 `isTypingTarget(event.target)`일 때만 한다 — 스위치 같은 버튼의 ⌘Z는 `editor-shortcuts`가 받으므로 두 번 undo 된다.
  - PBR 반사용 환경 텍스처는 `public/environments/studio.env` (CC BY 4.0, `NOTICE.md`). 없으면 금속이 검게 보인다.
  - shadcn `Slider`에는 `value={[n]}`처럼 배열로 넘긴다 (숫자 하나면 thumb이 두 개 그려진다). `aria-label`은 thumb(실제 `role=slider`)에 붙도록 고쳐 두었다 — E2E는 `getByRole("slider", { name })`로 찾는다.
- 씬 설정(`lib/scene-settings.ts`): 배경색 · 환경광 세기(`scene.environmentIntensity`) · 노출 · 톤 매핑(`imageProcessingConfiguration`). 선택이 없을 때 속성 패널에 보인다(`scene-settings-section.tsx`). 바꾸는 곳은 모두 `applySceneSettings`를 거치고 화면은 `usePropertyValue(sceneSettingsProperty, scene)`로 구독한다 (`scene.clearColor` 등에 직접 대입하지 않는다). 편집은 `createSceneSettingsCommand`(라벨 "씬 설정"). 새 씬·열기·복구는 기본값(`DEFAULT_SCENE_SETTINGS`)으로 돌린 뒤 파일 값을 입힌다 (`replaceScene`). 노출·톤 매핑은 PBR 머티리얼에만 걸린다(배경·격자 제외). 기본 톤 매핑은 "없음"(예전 모습 유지).
- 씬 파일: 형식은 `lib/scene-format.ts`(에디터 전용 JSON — 씬 설정과 메쉬마다 프리셋·이름·위치·회전(도)·크기·머티리얼·숨김·잠금만, `format`/`version` 필드), 문서 상태(파일 이름·핸들·저장 안 된 변경·새 씬/열기/저장)는 `lib/scene-file.ts`. 브라우저 파일 입출력은 공용 `src/lib/file-access.ts`(File System Access API, 없으면 input/다운로드 폴백).
  - **새 씬·열기는 히스토리를 비운다** (undo 대상 아님, Command 예외). 이때만 에디터 메쉬를 직접 해제한다 (`clearEditorMeshes`, 반드시 `history.clear()` 뒤).
  - 변경 여부는 저장 시점의 `history.mark()`와 비교한다 (undo로 저장 시점에 돌아오면 깨끗한 상태. 최대 개수 초과로 빠진 Command가 있으면 끝까지 undo 해도 처음과 다른 값). 변경이 있으면 `DiscardChangesDialog`로 묻는다 (`confirmPending` → `resolveConfirm`).
  - 열기는 파싱·검증(`parseSceneFile`)이 성공한 뒤에만 씬을 바꾼다. 실패 메시지(`SceneFileError`)는 토스트로 보여준다.
  - 자동 저장(`lib/autosave.ts`): 파일로 저장 안 된 변경이 있으면 1초 뒤(탭이 숨겨지면 즉시) IndexedDB(`src/lib/kv-store.ts`)에 씬 텍스트를 남기고, 깨끗해지면 지운다. 시작할 때 기록이 있으면 `RecoveryDialog`로 복구/버리기를 묻고, **답을 받기 전에는 아무것도 쓰지 않는다** (빈 씬이 기록을 지우지 않게). 복구는 `sceneFile.restore` — 히스토리는 비우고, 파일로 저장할 때까지 "변경 있음"으로 둔다. 파일 핸들은 복구하지 않는다(첫 저장 때 위치를 다시 묻는다). 저장소는 하나라 여러 탭에서 동시에 편집하면 마지막 탭 내용만 남는다.
  - 현재 v7: 메쉬마다 `parent`(부모의 `meshes` 번호, 최상위는 null — 값은 부모 기준, 자기 자신·범위 밖·순환은 오류, v6 이하는 모두 최상위). v6: 조명 객체(presetId `*-light`, `light` 값, `material`은 null)와 `settings.ambientIntensity` (v5 이하는 조명 없음·1). v5: 메쉬마다 `shape` (v4 이하·빠진 키는 기본 모양, 프리셋에 없는 키·범위 밖은 오류). v4: 최상위 `settings`, 머티리얼 `emissive`·`alpha`·`unlit` (v3 이하·빠진 값은 기본값). v3에서 메쉬마다 `hidden`·`locked` (v2 이하는 false로 변환).
  - 내보내기(`lib/scene-export.ts`, 파일 메뉴): glTF(.glb)와 스크린샷(.png). 씬 파일 저장이 아니다 — 히스토리·"변경 있음"은 그대로. 둘 다 "숨기지 않은 에디터 메쉬"(`getExportMeshes`)만 담고, 파일 이름은 씬 파일 이름을 따른다(`exportBaseName`). 저장은 공용 `saveFile`(텍스트·Blob).
    - GLB: `@babylonjs/serializers`(버전은 core와 같게 고정)를 처음 내보낼 때 동적 import. `shouldExportNode`로 격자·피벗·카메라·조명을 뺀다. Babylon 규칙대로 X가 반전돼 나간다(왼손→오른손, Babylon 로더로 열면 원래 자리). 이 파일은 에디터로 다시 열지 않는다.
    - 스크린샷: 자체 `RenderTargetTexture`(renderList = 내보낼 메쉬)를 그려 `readPixels` → 2D 캔버스로 PNG 인코딩. 기즈모(유틸리티 레이어)·선택 외곽선(효과 레이어)은 렌더 타깃에 안 그려진다. 렌더 타깃 픽셀은 WebGL·WebGPU 모두 아래 줄부터라 뒤집는다. Babylon `CreateScreenshotUsingRenderTargetAsync`는 쓰지 않는다 — 딥 import에선 인코딩용 셰이더·엔진 확장이 빠져 하얀 이미지가 나오거나 Promise가 끝나지 않는다. E2E가 두 엔진에서 픽셀(배경색·위아래)을 확인한다.
  - 형식을 바꾸면 `SCENE_FILE_VERSION`을 올리고 이전 버전 변환을 `parseSceneFile`에 넣는다. 메쉬에 새 속성을 추가하면 `MeshSnapshot`과 씬 파일 둘 다에 넣는다.
- **키보드 단축키는 `lib/editor-shortcuts.ts`의 키맵 표(`SHORTCUTS`) 한 곳에서만 등록**한다. 도구에서 `window.addEventListener("keydown")`을 직접 달지 않는다 (같은 키의 우선순위가 등록 순서에 묶이기 때문). 표의 한 줄 = `{ id, 키 조합(key/code·mod·ctrl·shift·alt), label, run }`이고, 배열 순서가 우선순위다 — `run`이 `false`를 돌려주면 "하지 않음"으로 같은 키의 다음 줄로 넘어간다 (배치 중 R은 회전, 아니면 크기 도구). 새 단축키는 `NAMED_SHORTCUTS`에 줄을 추가한다 (`preventDefault: false`는 글자 키·Esc처럼 막을 기본 동작이 없을 때). 매칭은 순수 함수 `shortcutCandidates(event)`라 Node에서 검사한다.
  - 사용 중: Esc · Delete/Backspace · Q/W/E/R(도구) · R/⇧R(배치 중일 때만 미리보기 90° 회전 — 크기 도구보다 우선, `placement.rotate`) · 1~8(메쉬 프리셋, `MESH_PRESETS` 순서, 상단 숫자열만) · ⌘Z/⌘⇧Z/Ctrl+Y · ⌘C/⌘X/⌘V(복사/잘라내기/붙여넣기) · ⌘D(복제, 브라우저 북마크는 항상 막음) · F(선택 메쉬로 카메라 포커스) · ⌘A(전체 선택, 숨기거나 잠근 메쉬 제외) · H/⌥H(숨기기/모두 보이기) · End(바닥에 붙이기) · P/⌥P(부모 지정/해제) · 숫자패드 1/3/7(⌃와 함께 반대편)·5(시점·직교) · F2(이름 바꾸기) · ⌘S/⌘⇧S(저장/다른 이름으로 저장) · ⌘O(열기) · ⇧A(검색형 추가 메뉴) · ?(도움말). 새 씬은 단축키 없음(⌘N은 브라우저가 가로챔).
  - 키를 누르고 있을 때의 반복 입력(`event.repeat`)은 undo/redo와 배치 회전(R)만 받는다 (숫자 키를 누르고 있으면 배치가 켜졌다 꺼지는 것을 막는다). 누르고 있는 동안 반복돼야 하는 새 단축키는 그 줄에 `repeatable: true`를 준다.
  - **키 판정은 `getShortcutKey(event)`로 한다** (`event.key` 직접 비교 금지). 글자 키를 `event.code`(물리 키 위치)로 봐서 한글 입력 상태(Q → "ㅂ")에서도 같은 단축키가 동작한다. 입력창 안에서 ⌘Z 등을 직접 처리하는 컴포넌트도 같은 함수를 쓴다.
  - 단축키를 UI에 보여줄 땐 하드코딩하지 말고 `editor-shortcuts.ts`에서 가져온다: `getPresetShortcut`, `getToolShortcut`, `SHORTCUT_LABELS`(표의 `id` → `label`: undo/redo/redoAlt/delete/deleteForward/save/open/selectAll/focus/hide/dropToFloor/orthographic/rotatePlacement(Back) 등), 시점은 `VIEW_SHORTCUTS`. 모두 표에서 파생되므로 처리기와 어긋날 수 없다.
  - 메뉴의 라디오·체크박스 항목엔 `closeOnClick`을 준다 (Base UI 기본값은 안 닫힘 → 다음 키 입력이 메뉴로 빨려 들어간다).
- 도움말: `?`·도움말 메뉴의 단축키 창(`shortcut-help-dialog.tsx`, 상태는 `runtime.help`)과 사용 설명서 페이지(`/manual` → `ManualPage`). 둘 다 단축키 목록 `SHORTCUT_GROUPS`(`lib/editor-reference.ts`)와 마우스 조작표 `MOUSE_CONTROLS`(`lib/camera-controls.ts`)를 같이 쓴다. 메쉬 종류·스냅 단위·도구 이름도 에디터 값에서 가져온다 — 손으로 다시 적지 않는다.
  - 단축키를 추가하면 `SHORTCUT_GROUPS`에도 넣는다 (`editor-reference.test`가 표의 라벨 — `SHORTCUT_LABELS`·`VIEW_SHORTCUTS`·프리셋 키 — 이 다 있는지 확인). 목록은 짝(정면/뒤 …)과 순서를 사람이 정하므로 표에서 자동으로 만들지 않는다. 마우스 규칙을 바꾸면 `MOUSE_CONTROLS`도 고친다.
  - 사용자가 보는 동작을 바꾸면 `manual-page.tsx`의 설명 글도 고친다.
- 뷰포트 클릭은 `POINTERTAP`으로 처리한다 (드래그 = 카메라 조작·기즈모 드래그와 구분).

## UI 규칙 (shadcn / Base UI)

- UI는 `@/components/ui`의 shadcn 컴포넌트로 만든다. `src/features`·`src/app`에서 네이티브 `<button>`, `<input>`, `<select>`, `<textarea>`는 ESLint 에러 → `Button`, `Input`, `NativeSelect`, `Textarea`. **실제로 쓰는 컴포넌트만 둔다** — 없는 것은 필요할 때 `pnpm dlx shadcn@latest add <name>`으로 추가하고, 안 쓰게 되면 파일과 그 전용 의존성을 지운다. (`shadcn` 패키지는 `globals.css`가 `shadcn/tailwind.css`를 import 하므로 남긴다.)
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
