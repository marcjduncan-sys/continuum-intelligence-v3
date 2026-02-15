#!/bin/bash
# Sync DNE files from continuum-platform to continuum-intelligence
# Run this from a terminal that has git push access to continuum-intelligence

set -e

PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"
INTELLIGENCE_DIR="${PLATFORM_DIR}/../continuum-intelligence"

if [ ! -d "$INTELLIGENCE_DIR" ]; then
  echo "Cloning continuum-intelligence..."
  git clone https://github.com/marcjduncan-sys/continuum-intelligence.git "$INTELLIGENCE_DIR"
fi

echo "Copying updated files..."
cp "$PLATFORM_DIR/stock.html" "$INTELLIGENCE_DIR/stock.html"
cp "$PLATFORM_DIR/css/narrative.css" "$INTELLIGENCE_DIR/css/narrative.css"
cp "$PLATFORM_DIR/js/dne/ui.js" "$INTELLIGENCE_DIR/js/dne/ui.js"
cp "$PLATFORM_DIR/data/stocks/WOW.json" "$INTELLIGENCE_DIR/data/stocks/WOW.json"
cp "$PLATFORM_DIR/data/stocks/CSL.json" "$INTELLIGENCE_DIR/data/stocks/CSL.json"
cp "$PLATFORM_DIR/data/stocks/WTC.json" "$INTELLIGENCE_DIR/data/stocks/WTC.json"

cd "$INTELLIGENCE_DIR"
git add -A
git commit -m "Sync: dislocation redesign, hypotheses clarity, PDF reports"
git push origin main

echo "Done! Changes will be live at:"
echo "  https://marcjduncan-sys.github.io/continuum-intelligence/stock.html?ticker=WOW.AX"
echo "  https://marcjduncan-sys.github.io/continuum-intelligence/stock.html?ticker=CSL.AX"
echo "  https://marcjduncan-sys.github.io/continuum-intelligence/stock.html?ticker=WTC.AX"
