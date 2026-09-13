#!/usr/bin/env bash
set -euo pipefail

# Change these defaults here, or override them when running the script:
#   BASE_URL="https://your-site.example.com" REAL_SUBMIT=true ./run_validation.sh

export BASE_URL="${BASE_URL:-https://your-site.example.com}"
export BROWSERS="${BROWSERS:-chromium,firefox}"
export REPETITIONS="${REPETITIONS:-3}"
export WORD_THRESHOLD="${WORD_THRESHOLD:-50}"
export MIN_DURATION_MS="${MIN_DURATION_MS:-180000}"
export REAL_DURATION="${REAL_DURATION:-false}"
export REAL_SUBMIT="${REAL_SUBMIT:-false}"
export USE_REAL_LLM="${USE_REAL_LLM:-false}"
export RUN_GUARD_CHECKS="${RUN_GUARD_CHECKS:-true}"
export RUN_NAVIGATION_CHECKS="${RUN_NAVIGATION_CHECKS:-true}"
export NAVIGATION_AWAY_MS="${NAVIGATION_AWAY_MS:-5000}"
export HEADLESS="${HEADLESS:-true}"

echo "Running technical validation"
echo "BASE_URL=$BASE_URL"
echo "BROWSERS=$BROWSERS"
echo "REPETITIONS=$REPETITIONS"
echo "REAL_SUBMIT=$REAL_SUBMIT"
echo "USE_REAL_LLM=$USE_REAL_LLM"
echo "REAL_DURATION=$REAL_DURATION"
echo "RUN_GUARD_CHECKS=$RUN_GUARD_CHECKS"
echo "RUN_NAVIGATION_CHECKS=$RUN_NAVIGATION_CHECKS"
echo "NAVIGATION_AWAY_MS=$NAVIGATION_AWAY_MS"

if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD=(pnpm)
elif command -v pnpm.cmd >/dev/null 2>&1; then
  PNPM_CMD=(pnpm.cmd)
elif [[ -f "/c/Users/user1/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd" ]]; then
  PNPM_CMD=("/c/Users/user1/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd")
elif [[ -f "C:/Users/user1/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd" ]]; then
  PNPM_CMD=("C:/Users/user1/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd")
else
  echo "Could not find pnpm. Install Node.js/pnpm or set PNPM_CMD to your pnpm executable." >&2
  exit 127
fi

"${PNPM_CMD[@]}" run validate
