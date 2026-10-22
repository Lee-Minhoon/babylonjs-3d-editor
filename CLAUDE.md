# babylonjs-3d-editor

Next.js(App Router) + Babylon.js 기반 브라우저 3D 에디터.

## 스택

- Next.js 16 / React 19 (React Compiler 켜짐) / TypeScript strict / Tailwind v4
- Babylon.js 9: `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/inspector`
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

## 폴더 규칙

```
src/
├── app/             # 라우트. 특정 라우트 전용 컴포넌트는 app/**/_components/
├── components/      # 여러 곳에서 쓰는 공용 컴포넌트
├── hooks/           # 공용 훅
└── lib/             # 도메인에 종속되지 않는 외부 SDK 초기화 / 전역 인프라 유틸
    └── babylon/     # 엔진 생성, 로더 등록, 인스펙터
```

- **파일명·폴더명은 kebab-case**: `babylon-canvas.tsx`, `use-babylon-scene.ts`, `src/lib/babylon/`, `app/editor-settings/`. React 컴포넌트·훅 파일도 kebab-case (export하는 이름은 `BabylonCanvas`, `useBabylonScene` 그대로).
  - 적용 범위: `src/`, `scripts/`, `.claude/hooks/` 아래의 모든 폴더·파일. 루트 설정 파일(`next.config.ts` 등)은 도구가 이름을 정하므로 제외.
  - 폴더 예외 (Next.js 라우팅 문법, 괄호/접두사 안쪽 이름은 kebab-case): `_components`, `(group)`, `[id]`, `[...slug]`, `[[...slug]]`, `@modal`, `(.)photo`/`(..)photo`/`(...)photo`.
  - `engine.test.ts`, `types.d.ts`처럼 첫 `.` 뒤의 확장자 부분은 검사하지 않는다.
  - 판정 기준과 예외 목록은 [scripts/check-naming.mjs](scripts/check-naming.mjs) 하나뿐이다. 규칙을 바꿀 땐 이 파일만 고친다.
  - 강제 지점: ESLint(`local/kebab-case-path`), Write 전 PreToolUse 훅(생성 차단), Stop 훅(전체 검사), git pre-commit(husky).
- `lib/`에는 비즈니스(에디터 기능) 로직을 넣지 않는다. 에디터 기능이 아니라 "어디서든 쓸 수 있는 인프라"만.
- 한 곳에서만 쓰는 컴포넌트는 `components/`가 아니라 해당 라우트의 `_components/`에 둔다.
- import는 `@/*` (→ `src/*`) 별칭 사용.

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
