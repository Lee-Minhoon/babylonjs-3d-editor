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
pnpm build      # 프로덕션 빌드
```

작업을 마치기 전 `pnpm typecheck && pnpm lint && pnpm format:check && pnpm lint:naming`가 통과해야 한다. (Stop 훅이 typecheck와 이름 규칙 검사를 강제함)

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
  - 적용 범위: `src/`, `scripts/`, `.claude/hooks/` 아래의 모든 폴더·파일. 루트 설정 파일(`next.config.ts` 등)은 도구가 이름을 정하므로 제외.
  - 폴더 예외 (Next.js 라우팅 문법, 괄호/접두사 안쪽 이름은 kebab-case): `_private`, `(group)`, `[id]`, `[...slug]`, `[[...slug]]`, `@modal`, `(.)photo`/`(..)photo`/`(...)photo`.
  - `engine.test.ts`, `types.d.ts`처럼 첫 `.` 뒤의 확장자 부분은 검사하지 않는다.
  - 판정 기준과 예외 목록은 [scripts/check-naming.mjs](scripts/check-naming.mjs) 하나뿐이다. 규칙을 바꿀 땐 이 파일만 고친다.
  - 강제 지점: ESLint(`local/kebab-case-path`), Write 전 PreToolUse 훅(생성 차단), Stop 훅(전체 검사), git pre-commit(husky).
- 루트 `lib/`에는 비즈니스(에디터 기능) 로직을 넣지 않는다. "어디서든 쓸 수 있는 인프라"만. 기능 로직은 `features/<name>/lib/`.
- 한 feature에서만 쓰는 코드는 공용 폴더가 아니라 그 feature 안에 둔다. `app/` 안에 `_components` 같은 폴더를 만들지 않는다.
- import는 `@/*` (→ `src/*`) 별칭 사용.

## 에디터 구조 (`src/features/editor`)

- 뷰포트가 씬과 함께 도구들을 만들어 `EditorRuntime`(`{ scene, history, placement, selection, tools }`)으로 UI에 넘긴다. 도구는 순수 TS 객체(`lib/`)이고, React는 `subscribe`/`getX`를 `useSyncExternalStore`로 구독만 한다.
- 활성 도구(`tools`): `select | move | rotate | scale` (Q/W/E/R). 배치 모드는 그 위에 잠깐 덮어쓰는 모드다. 기즈모는 선택된 메쉬 + move/rotate/scale + 배치 모드 아님일 때만 보인다.
- **뷰포트 포인터 입력은 `lib/pointer-router.ts` 한 곳에서만 받는다.** 우선순위: 기즈모 위/드래그 중 → 배치 모드 → 선택. 새 도구가 클릭을 받아야 하면 `scene.onPointerObservable`을 직접 구독하지 말고 라우터에 분기를 추가한다 (기즈모 클릭이 선택 해제로 새는 식의 충돌 방지).
- 기즈모 드래그는 시작/끝 스냅샷으로 **드래그 한 번 = 변형 Command 하나**를 기록한다 (`transform-command.ts`).
- **씬을 바꾸는 동작은 반드시 Command로 만들어 `history.execute()`로 실행**한다 (undo/redo 대상). 메쉬를 직접 `dispose()`하지 않는다 — 삭제는 `createRemoveMeshCommand`.
- 선택(`selection`)은 히스토리에 기록하지 않는다. 선택된 메쉬가 씬에서 빠지면 자동 해제된다.
- **키보드 단축키는 `lib/editor-shortcuts.ts` 한 곳에서만 등록**한다. 도구에서 `window.addEventListener("keydown")`을 직접 달지 않는다 (같은 키의 우선순위가 등록 순서에 묶이기 때문).
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
