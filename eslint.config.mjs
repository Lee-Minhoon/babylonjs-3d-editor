import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import { readdirSync } from "node:fs";

import { findViolation, toRelative } from "./scripts/check-naming.mjs";

/** 파일명·폴더명 kebab-case 규칙. 기준은 scripts/check-naming.mjs (훅/pre-commit과 공유). */
const localPlugin = {
  rules: {
    "kebab-case-path": {
      meta: {
        type: "problem",
        docs: { description: "파일명·폴더명은 kebab-case여야 한다" },
        messages: {
          file: "파일명 '{{name}}'은 kebab-case여야 합니다 (예: babylon-canvas.tsx). scripts/check-naming.mjs 참고.",
          folder:
            "폴더명 '{{name}}'은 kebab-case여야 합니다 ({{path}}). scripts/check-naming.mjs 참고.",
        },
        schema: [],
      },
      create(context) {
        const violation = findViolation(toRelative(context.filename));
        if (violation) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: violation.kind,
            data: { name: violation.name, path: violation.path },
          });
        }
        return {};
      },
    },
  },
};

/**
 * 의존 방향: app → features → 공용(components, hooks, lib).
 * - 공용 코드는 features/app을, features는 app을 import 할 수 없다.
 * - feature끼리는 서로 import 할 수 없다 (feature 폴더 목록으로 zone 자동 생성).
 * - app은 feature의 index.ts(public API)만 import 할 수 있다.
 * 경로를 실제 파일로 resolve해서 검사하므로 상대 경로로 우회해도 잡힌다.
 */
const SHARED = ["./src/components", "./src/hooks", "./src/lib"];
const features = (() => {
  try {
    return readdirSync(new URL("./src/features", import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    // features 폴더가 아직 없을 때만 무시
    if (error?.code === "ENOENT") return [];
    throw error;
  }
})();

const boundaryZones = [
  {
    target: SHARED,
    from: ["./src/features", "./src/app"],
    message:
      "공용 코드(components/hooks/lib)는 features·app에 의존할 수 없습니다. 필요한 코드를 공용으로 올리세요.",
  },
  {
    target: "./src/features",
    from: "./src/app",
    message: "features는 app에 의존할 수 없습니다.",
  },
  ...features.map((feature) => ({
    target: `./src/features/${feature}`,
    from: "./src/features",
    except: [`./${feature}`],
    message:
      "feature끼리는 서로 import 할 수 없습니다. 공용 폴더로 올리거나 app에서 조합하세요.",
  })),
  {
    target: "./src/app",
    from: ["./src/features/*/!(index).*", "./src/features/*/*/**"],
    message:
      'feature는 public API(index.ts)로만 import 하세요. 예: import { Editor } from "@/features/editor"',
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
      local: localPlugin,
    },
    rules: {
      "local/kebab-case-path": "error",
      "import/no-restricted-paths": [
        "error",
        { basePath: import.meta.dirname, zones: boundaryZones },
      ],

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
