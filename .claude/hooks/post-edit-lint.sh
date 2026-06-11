#!/bin/bash
# PostToolUse hook — runs ESLint on edited TypeScript files in CLI package
set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only lint TypeScript files in packages/cli/src
if [[ -z "$FILE" ]]; then
  exit 0
fi

if [[ "$FILE" != *.ts ]]; then
  exit 0
fi

if [[ "$FILE" != *packages/*/src* ]]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Run ESLint on the specific file — report but don't block
RESULT=$(npx eslint "$FILE" --no-error-on-unmatched-pattern --format compact 2>&1 || true)

if echo "$RESULT" | grep -q "error"; then
  echo "Lint issues in $(basename "$FILE"):" >&2
  echo "$RESULT" | grep "error" | head -5 >&2
fi

exit 0
