#!/usr/bin/env node
/**
 * 파일명·폴더명 kebab-case 규칙 — 단일 기준(source of truth).
 * ESLint 로컬 룰, Claude Code 훅, git pre-commit 훅이 모두 이 모듈을 사용한다.
 *
 * CLI:
 *   node scripts/check-naming.mjs            # git 추적 + 새 파일 전체 검사
 *   node scripts/check-naming.mjs <path...>  # 지정 경로만 검사 (존재하지 않아도 됨)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 규칙을 적용할 디렉터리. 이 디렉터리 자체가 아니라 그 아래의 폴더/파일 이름을 검사한다.
 * 루트의 도구 설정 파일(next.config.ts 등)은 이름이 정해져 있어 제외.
 */
export const SCOPES = ["src/", "scripts/", ".claude/hooks/"];

// Next.js 예약 파일명(not-found, global-error 등)은 원래 kebab-case라 별도 예외가 필요 없다.
const KEBAB = "[a-z0-9]+(?:-[a-z0-9]+)*";
const KEBAB_CASE = new RegExp(`^${KEBAB}$`);

/** 폴더명 허용 패턴. Next.js 라우팅 규칙의 괄호/접두사 안쪽 이름도 kebab-case여야 한다. */
const FOLDER_PATTERNS = [
  KEBAB_CASE, // editor, scene-graph
  new RegExp(`^_${KEBAB}$`), // _components  (private folder)
  new RegExp(`^\\(${KEBAB}\\)$`), // (marketing) (route group)
  new RegExp(`^\\[${KEBAB}\\]$`), // [id]        (dynamic segment)
  new RegExp(`^\\[\\.\\.\\.${KEBAB}\\]$`), // [...slug]   (catch-all)
  new RegExp(`^\\[\\[\\.\\.\\.${KEBAB}\\]\\]$`), // [[...slug]] (optional catch-all)
  new RegExp(`^@${KEBAB}$`), // @modal      (parallel route slot)
  new RegExp(`^(?:\\(\\.\\)|(?:\\(\\.\\.\\))+|\\(\\.\\.\\.\\))${KEBAB}$`), // (.)photo, (..)(..)photo, (...)photo (intercepting)
];

/** 프로젝트 루트 기준 상대 경로 (POSIX 구분자) */
export function toRelative(filePath) {
  return path.relative(ROOT, path.resolve(filePath)).split(path.sep).join("/");
}

function scopeOf(relPath) {
  return SCOPES.find((scope) => relPath.startsWith(scope));
}

export function inScope(relPath) {
  return scopeOf(relPath) !== undefined;
}

/**
 * 파일명의 첫 '.' 앞부분이 kebab-case인지 검사한다.
 * `engine.test.ts`, `types.d.ts` 처럼 중간 확장자는 허용. 점 파일(.gitkeep)도 허용.
 */
export function isValidFilename(fileName) {
  const stem = fileName.split(".")[0];
  return stem === "" || KEBAB_CASE.test(stem);
}

export function isValidFolderName(folderName) {
  return FOLDER_PATTERNS.some((pattern) => pattern.test(folderName));
}

/**
 * 경로에서 규칙을 어긴 첫 지점을 반환한다. 문제 없으면 null.
 * @returns {{ kind: "folder" | "file", name: string, path: string } | null}
 */
export function findViolation(relPath) {
  const scope = scopeOf(relPath);
  if (!scope) return null;

  const segments = relPath.slice(scope.length).split("/");
  const fileName = segments.pop();

  for (let i = 0; i < segments.length; i++) {
    if (!isValidFolderName(segments[i])) {
      return {
        kind: "folder",
        name: segments[i],
        path: scope + segments.slice(0, i + 1).join("/") + "/",
      };
    }
  }
  if (!isValidFilename(fileName)) {
    return { kind: "file", name: fileName, path: relPath };
  }
  return null;
}

/** 위반 지점 목록 (같은 폴더 위반은 한 번만) */
export function findViolations(filePaths) {
  const byPath = new Map();
  for (const rel of filePaths.map(toRelative)) {
    const violation = findViolation(rel);
    if (violation) byPath.set(violation.path, violation);
  }
  return [...byPath.values()];
}

function listProjectFiles() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .map((rel) => path.join(ROOT, rel));
}

function main(args) {
  const violations = findViolations(args.length ? args : listProjectFiles());
  if (violations.length === 0) return 0;

  console.error(
    [
      "파일명·폴더명은 kebab-case여야 합니다 (예: src/hooks/use-babylon-scene.ts).",
      ...violations.map(
        (v) => `  ✖ ${v.path}  (${v.kind === "folder" ? "폴더" : "파일"})`,
      ),
      `적용 범위: ${SCOPES.join(", ")}`,
      "폴더 예외: _private, (group), [id], [...slug], [[...slug]], @slot, (.)intercept — 괄호 안 이름은 kebab-case",
    ].join("\n"),
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
