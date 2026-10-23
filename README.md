# babylonjs-3d-editor

Next.js + Babylon.js 기반 3D 에디터.

## Getting Started

```bash
corepack enable   # package.json의 packageManager(pnpm) 버전을 사용
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인.

## Scripts

| 명령                | 설명                              |
| ------------------- | --------------------------------- |
| `pnpm dev`          | 개발 서버                         |
| `pnpm build`        | 프로덕션 빌드                     |
| `pnpm start`        | 빌드 결과 실행                    |
| `pnpm lint`         | ESLint                            |
| `pnpm lint:fix`     | ESLint 자동 수정 (import 정렬 등) |
| `pnpm typecheck`    | TypeScript 타입 검사              |
| `pnpm format`       | Prettier로 전체 포맷              |
| `pnpm format:check` | 포맷 검사 (CI용)                  |
| `pnpm lint:naming`  | 파일명·폴더명 kebab-case 검사     |

커밋 시 husky pre-commit 훅이 새로 추가된 파일의 파일명·폴더명을 검사합니다. (`pnpm install` 시 자동 설정)

VS Code를 쓴다면 추천 확장(Prettier, ESLint, Tailwind CSS)을 설치하세요. 저장 시 자동 포맷됩니다.

## 폴더 구조

```
src/
├── app/          # Next.js App Router (라우팅만, thin하게 유지)
├── features/     # 기능 단위 모듈 (예: editor). 외부에는 index.ts로만 공개
├── components/   # 공용 컴포넌트
├── hooks/        # 공용 훅
└── lib/          # 비즈니스 도메인에 종속되지 않는 외부 SDK 초기화 / 전역 인프라 유틸리티
    └── babylon/  # Babylon.js 엔진 생성 등
```

## 개발 팁

- 개발 모드에서 `Shift + Alt + I` 로 Babylon Inspector를 열 수 있습니다.
- 코딩 규칙(폴더 역할, Babylon import 방식 등)은 [CLAUDE.md](CLAUDE.md)에 정리되어 있습니다.
