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

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 빌드 결과 실행 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 타입 검사 |

## 폴더 구조

```
src/
├── app/          # Next.js App Router (라우트, 레이아웃)
├── components/   # 공용 컴포넌트
├── hooks/        # 공용 훅
└── lib/          # 비즈니스 도메인에 종속되지 않는 외부 SDK 초기화 / 전역 인프라 유틸리티
    └── babylon/  # Babylon.js 엔진 생성 등
```

## 개발 팁

- 개발 모드에서 `Shift + Alt + I` 로 Babylon Inspector를 열 수 있습니다.
- 코딩 규칙(폴더 역할, Babylon import 방식 등)은 [CLAUDE.md](CLAUDE.md)에 정리되어 있습니다.
