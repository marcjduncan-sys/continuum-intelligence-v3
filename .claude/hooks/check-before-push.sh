#!/usr/bin/env bash
# Claude Code PreToolUse hook
# Intercepts Bash tool calls containing "git push" and runs test:unit first.
# Tool info arrives as JSON on stdin from Claude Code.
# Exit non-zero to block the tool call; exit 0 to allow it.

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")

if echo "$COMMAND" | grep -qE '^\s*git push'; then
  echo "[pre-push hook] git push detected -- running test:unit first..."
  if ! npm run test:unit; then
    echo ""
    echo "[pre-push hook] BLOCKED: Vitest tests failed. Fix before pushing."
    exit 1
  fi
  echo "[pre-push hook] Tests passed. Proceeding with push."
fi
