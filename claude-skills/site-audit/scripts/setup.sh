#!/usr/bin/env bash
# Idempotent: installs Node dependencies and Chromium into the skill folder, checks testssl.sh.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SKILL_DIR"
if [ ! -d node_modules/playwright ] || [ ! -d node_modules/@axe-core/playwright ]; then
  npm install --silent --no-audit --no-fund >/dev/null
fi
npx --no-install playwright install chromium >/dev/null 2>&1 || npx playwright install chromium >/dev/null
command -v testssl.sh >/dev/null || { echo "MISSING: testssl.sh (brew install testssl)"; exit 1; }
command -v dig >/dev/null || echo "WARNING: dig not found; CAA lookup will rely on testssl only"
echo "setup ok"
