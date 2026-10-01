#!/usr/bin/env bash
# Runs every check for one site and prints the results folder.
# usage: audit.sh <domain-or-url> [--search-probe] [--no-tls]
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"; S="$SKILL_DIR/scripts"
INPUT="${1:?usage: audit.sh <domain> [--search-probe] [--no-tls]}"; shift || true
PROBE=""; TLS=1
for a in "$@"; do case "$a" in --search-probe) PROBE="--search-probe";; --no-tls) TLS=0;; esac; done
HOST=$(echo "$INPUT" | sed -E 's#^[a-zA-Z]+://##; s#[/?#].*$##; s#:.*$##' | tr 'A-Z' 'a-z')
[[ "$HOST" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "invalid domain: $HOST"; exit 2; }
OUT="${SITE_AUDIT_DIR:-$HOME/site-audits}/$HOST/$(date +%Y-%m-%d-%H%M)"
mkdir -p "$OUT"
printf '{"host":"%s","url":"https://%s/","started":"%s","searchProbe":%s}\n' "$HOST" "$HOST" "$(date -u +%FT%TZ)" "$([ -n "$PROBE" ] && echo true || echo false)" >"$OUT/meta.json"
cd "$SKILL_DIR"
bash "$S/setup.sh" >/dev/null || exit 1
[ $TLS = 1 ] && { bash "$S/tls.sh" "$HOST" "$OUT" & TLS_PID=$!; }
node "$S/discover.mjs" "$OUT" >"$OUT/discover.log" 2>&1 || { echo "discovery failed: $(tail -3 "$OUT/discover.log")"; exit 1; }
for step in headers privacy accessibility keyboard; do
  node "$S/$step.mjs" "$OUT" $([ "$step" = headers ] && echo "$PROBE") >"$OUT/$step.log" 2>&1 && tail -1 "$OUT/$step.log" || echo "$step FAILED: $(tail -2 "$OUT/$step.log")"
done
[ $TLS = 1 ] && { wait "$TLS_PID"; node "$S/tls-summary.mjs" "$OUT"; }
echo "RESULTS: $OUT"
