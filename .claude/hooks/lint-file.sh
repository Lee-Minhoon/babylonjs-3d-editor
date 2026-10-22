#!/usr/bin/env bash
# PostToolUse(Edit|Write): 수정된 JS/TS 파일에 ESLint 실행.
# 에러가 있으면 exit 2 → stderr가 Claude에게 전달되어 바로 고치게 한다.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')

case "$f" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
pnpm exec eslint "$f" >&2 || exit 2
