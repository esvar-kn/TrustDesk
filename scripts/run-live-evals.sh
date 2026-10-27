#!/usr/bin/env bash
# Capture the live benchmark numbers for the eval report (Phase 6.2/6.3).
#
# Runs, against a REAL provider (not the mock):
#   - 3 live eval runs, each --repeat 3, written to docs/eval/live-run-{1,2,3}.json
#   - 1 non-blocking bench against the live provider -> docs/eval/live-bench.json
#
# Prerequisites (in the repo-root .env or the environment):
#   LLM_PROVIDER   anthropic | openai | google | groq   (NOT mock)
#   LLM_API_KEY    a valid key for that provider
#   LLM_MODEL      the provider's model id
#   MONGODB_URI    a SEEDED database (run `npm --prefix server run seed` first)
#
# Usage:
#   ./scripts/run-live-evals.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/eval"
mkdir -p "$OUT"

# Load .env if present (without clobbering already-set environment variables).
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PROVIDER="${LLM_PROVIDER:-mock}"
if [[ "$PROVIDER" == "mock" ]]; then
  echo "ERROR: LLM_PROVIDER is 'mock'. Set a real provider + LLM_API_KEY + LLM_MODEL." >&2
  exit 1
fi
if [[ -z "${LLM_API_KEY:-}" ]]; then
  echo "ERROR: LLM_API_KEY is empty. A live run needs a real key." >&2
  exit 1
fi

echo "Live runs with provider=$PROVIDER model=${LLM_MODEL:-<unset>}"

for i in 1 2 3; do
  echo "== Live eval run $i/3 (--repeat 3) =="
  npm --prefix "$ROOT/server" run eval -- \
    --provider "$PROVIDER" --repeat 3 --out "$OUT/live-run-$i.json"
done

echo "== Live non-blocking bench =="
npm --prefix "$ROOT/server" run bench -- \
  --no-mem --provider "$PROVIDER" --repeat 3 --out "$OUT/live-bench.json"

echo "Done. Outputs in $OUT (gitignored):"
ls -1 "$OUT"
