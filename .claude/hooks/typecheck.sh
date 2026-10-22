#!/usr/bin/env bash
# Stop: 작업을 끝내기 전에 타입 검사.
# 실패하면 exit 2 → Claude가 멈추지 않고 타입 에러를 고친다.
# stop_hook_active가 true면(이미 한 번 막힌 상태) 무한 루프 방지를 위해 통과.
jq -e '.stop_hook_active == true' >/dev/null && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
pnpm -s typecheck >&2 || exit 2
