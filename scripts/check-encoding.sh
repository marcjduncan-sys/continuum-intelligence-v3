#!/bin/bash
# scripts/check-encoding.sh
# BEAD-002: Encoding regression gate
#
# Scans source and data files for encoding contamination characters that
# indicate unsanitised LLM or external text has entered the codebase.
# Fails with exit code 1 if any contamination is found.
#
# Modes:
#   bash scripts/check-encoding.sh         # Check src/ JS files only (fast, CI default)
#   bash scripts/check-encoding.sh --full   # Check src/ + data/ + api/ (local audit)
#
# Python source (api/) em-dashes in comments/docstrings are style violations,
# not contamination vectors. They do not reach the frontend. The runtime
# sanitise_text() boundary (BEAD-001) handles data flowing through Python.
# Use --full to include Python + data checks for a comprehensive audit.

set -euo pipefail

MODE="${1:-ci}"
FOUND=0

echo "=== Encoding Contamination Check (mode: ${MODE}) ==="
echo ""

# ---------------------------------------------------------------------------
# Always checked: src/ JS and JSON source files (rendered by frontend)
# ---------------------------------------------------------------------------

if grep -rn $'\xe2\x80\x94' src/ --include="*.js" --include="*.mjs" --include="*.json" 2>/dev/null; then
  echo "FAIL: Em-dash (U+2014) found in src/"
  FOUND=1
fi

if grep -rn $'\xe2\x80\x9c' src/ --include="*.js" --include="*.mjs" --include="*.json" 2>/dev/null; then
  echo "FAIL: Left smart quote (U+201C) found in src/"
  FOUND=1
fi

if grep -rn $'\xe2\x80\x9d' src/ --include="*.js" --include="*.mjs" --include="*.json" 2>/dev/null; then
  echo "FAIL: Right smart quote (U+201D) found in src/"
  FOUND=1
fi

if grep -rn $'\xc2\xa0' src/ --include="*.js" --include="*.mjs" --include="*.json" 2>/dev/null; then
  echo "FAIL: Non-breaking space (U+00A0) found in src/"
  FOUND=1
fi

# ---------------------------------------------------------------------------
# Always checked: null bytes in Python source (crashes import)
# ---------------------------------------------------------------------------

if grep -rPn '\x00' api/ --include="*.py" 2>/dev/null; then
  echo "FAIL: Null byte (0x00) found in api/ -- will crash Python import"
  FOUND=1
fi

# ---------------------------------------------------------------------------
# --full mode: also check data/ JSON and api/ Python files
# ---------------------------------------------------------------------------

if [ "$MODE" = "--full" ]; then
  echo "(Full mode: including data/ and api/ checks)"
  echo ""

  # data/ JSON files -- contamination from LLM outputs
  if grep -rn $'\xe2\x80\x94' data/ --include="*.json" 2>/dev/null; then
    echo "FAIL: Em-dash (U+2014) found in data/ JSON files"
    FOUND=1
  fi

  if grep -rn $'\xe2\x80\x9c' data/ --include="*.json" 2>/dev/null; then
    echo "FAIL: Left smart quote (U+201C) found in data/ JSON files"
    FOUND=1
  fi

  if grep -rn $'\xe2\x80\x9d' data/ --include="*.json" 2>/dev/null; then
    echo "FAIL: Right smart quote (U+201D) found in data/ JSON files"
    FOUND=1
  fi

  if grep -rn $'\xc2\xa0' data/ --include="*.json" 2>/dev/null; then
    echo "FAIL: Non-breaking space (U+00A0) found in data/ JSON files"
    FOUND=1
  fi

  # api/ Python -- exclude text_sanitise.py (defines the patterns)
  # and exclude prompt strings that contain examples of forbidden chars
  if grep -rn $'\xe2\x80\x94' api/ --include="*.py" 2>/dev/null \
    | grep -v 'text_sanitise.py' \
    | grep -v 'validate_research.py' \
    | grep -v '__pycache__' \
    | grep -v '\.pyc'; then
    echo "FAIL: Em-dash (U+2014) found in api/ Python files"
    FOUND=1
  fi
fi

echo ""

if [ $FOUND -eq 1 ]; then
  echo "ENCODING CHECK: FAILED"
  echo ""
  echo "Fix the source at the boundary where the contamination enters."
  echo "Do not patch downstream. See docs/recurring-issues-registry.md Family 1."
  exit 1
fi

echo "ENCODING CHECK: CLEAN"
exit 0
