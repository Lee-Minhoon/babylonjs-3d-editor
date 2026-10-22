#!/usr/bin/env bash
# PostToolUse(Edit|Write): 수정된 파일에 ESLint --fix(JS/TS만) → Prettier 순으로 실행.
# 같은 matcher의 훅은 병렬 실행되므로 순서를 보장하려고 한 스크립트로 묶는다.
# import 정렬·미사용 import 제거는 ESLint --fix가 처리하고, 그 결과를 Prettier가 마지막에 정리한다.
# 남은 ESLint 에러가 있으면 exit 2 → stderr가 Claude에게 전달되어 바로 고치게 한다.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -f "$f" ] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

status=0
case "$f" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs)
    pnpm exec eslint --fix "$f" >&2 || status=2
    ;;
esac

# 지원하지 않는 파일/ignore 대상은 조용히 건너뜀. 포맷 실패는 작업을 막지 않는다.
pnpm exec prettier --write --ignore-unknown --log-level warn "$f" >&2

exit $status
