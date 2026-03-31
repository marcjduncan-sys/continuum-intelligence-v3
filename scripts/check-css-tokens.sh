#!/bin/bash
# BEAD-008: CSS token linter
# Flags hardcoded px values in layout-critical CSS properties.
# Only checks values >= 400px -- these are panel/modal/content widths
# that must use design tokens to prevent drift.
#
# Exempt: tokens.css itself, @media queries (breakpoints use raw px),
#   values already using var(), border properties.
# Element-level sizing (< 400px) is allowed without tokens.
#
# Usage: bash scripts/check-css-tokens.sh
# Exit 0: clean. Exit 1: violations found.

set -euo pipefail

# Check max-width with hardcoded px >= 400
VIOLATIONS=$(grep -rn "max-width:" src/styles/ --include="*.css" \
  | grep -v "tokens.css" \
  | grep -v "@media" \
  | grep -v "var(--" \
  | grep -E "max-width:\s*[4-9][0-9]{2,}px|max-width:\s*[0-9]{4,}px" \
  || true)

# Check width declarations >= 400px (panels, modals, content areas)
WIDE_VIOLATIONS=$(grep -rn "^\s*width:" src/styles/ --include="*.css" \
  | grep -v "tokens.css" \
  | grep -v "@media" \
  | grep -v "var(--" \
  | grep -v "border" \
  | grep -E "width:\s*[4-9][0-9]{2,}px|width:\s*[0-9]{4,}px" \
  || true)

ALL_VIOLATIONS=""
if [ -n "$VIOLATIONS" ]; then
  ALL_VIOLATIONS="$VIOLATIONS"
fi
if [ -n "$WIDE_VIOLATIONS" ]; then
  if [ -n "$ALL_VIOLATIONS" ]; then
    ALL_VIOLATIONS="$ALL_VIOLATIONS
$WIDE_VIOLATIONS"
  else
    ALL_VIOLATIONS="$WIDE_VIOLATIONS"
  fi
fi

if [ -n "$ALL_VIOLATIONS" ]; then
  echo "CSS TOKEN DRIFT DETECTED:"
  echo "$ALL_VIOLATIONS"
  echo ""
  echo "Layout widths >= 400px must use CSS custom properties from src/styles/tokens.css."
  echo "See tokens.css for available layout tokens."
  exit 1
fi

echo "CSS token check: CLEAN"
exit 0
