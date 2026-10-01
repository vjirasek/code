#!/usr/bin/env bash
# TLS scan with testssl.sh (same options as the original manual run) plus a CAA lookup.
# usage: tls.sh <host> <outdir>
set -uo pipefail
HOST="$1"; OUT="$2"
testssl.sh --logfile "$OUT/tls.txt" --jsonfile "$OUT/tls.json" --color 0 --quiet --warnings batch --overwrite "https://$HOST" >/dev/null 2>"$OUT/tls.err"
echo "testssl exit $?" >>"$OUT/tls.err"
APEX=$(node -e "import('$(dirname "$0")/lib.mjs').then(m=>console.log(m.baseDomain(process.argv[1])))" "$HOST")
{ echo "apex=$APEX"; dig +short CAA "$APEX" 2>/dev/null; } >"$OUT/caa.txt"
