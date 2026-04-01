#!/bin/bash
# BEAD-005: Config drift linter
# Fails if any os.getenv() or os.environ call exists outside the canonical
# config file (api/config.py). Test files are excluded.
#
# Usage: bash scripts/check-config-drift.sh
# Exit 0: clean. Exit 1: violations found.

set -euo pipefail

CONFIG_FILE="api/config.py"

VIOLATIONS=$(grep -rn "os\.getenv\|os\.environ" --include="*.py" api/ \
  | grep -v "$CONFIG_FILE" \
  | grep -v "test" \
  | grep -v "__pycache__" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "CONFIG DRIFT DETECTED:"
  echo "$VIOLATIONS"
  echo ""
  echo "All environment variables must be read in $CONFIG_FILE only."
  echo "Import from config instead of calling os.getenv()."
  exit 1
fi

echo "Config drift check: CLEAN" 
