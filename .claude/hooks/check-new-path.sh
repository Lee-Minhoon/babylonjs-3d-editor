#!/usr/bin/env bash
# PreToolUse(Write): 새 파일을 만들기 전에 파일명·폴더명 kebab-case 규칙 검사.
# 위반이면 exit 2 → 파일 생성이 차단되고 stderr가 Claude에게 전달된다.
# 이미 존재하는 파일을 덮어쓰는 경우는 통과 (이름 위반은 Stop 훅/린트가 잡는다).
f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] || exit 0
[ -e "$f" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
node scripts/check-naming.mjs "$f" >&2 || exit 2
