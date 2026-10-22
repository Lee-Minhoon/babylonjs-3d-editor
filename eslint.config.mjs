import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      // import 정렬 (autofix). 그룹 사이엔 빈 줄이 들어간다.
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // 사이드이펙트 import (CSS 제외) — 예: "@babylonjs/core/Materials/standardMaterial"
            ["^\\u0000(?!.*\\.css$)"],
            // react, next (`import type`은 경로 끝에 \u0000이 붙어서 매칭된다)
            ["^react(/.*)?\\u0000?$", "^next(/.*)?\\u0000?$"],
            // 외부 패키지
            ["^@?\\w"],
            // 내부 별칭
            ["^@/"],
            // 상대 경로
            ["^\\."],
            // 스타일
            ["^.+\\.css$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      // simple-import-sort 권장 조합 (import 플러그인은 eslint-config-next에 포함)
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",

      // 안 쓰는 import는 autofix로 제거. 기본 no-unused-vars는 끄고 이 플러그인으로 대체.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // 포맷 관련 규칙을 끈다 (포맷은 Prettier 담당). 항상 마지막에 둘 것.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
