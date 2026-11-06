#!/bin/bash
# UI smoke test — verifies every page/component module transforms
# through vite without errors. Run before every push.
#
# Usage: pnpm test:smoke
# Exits 1 on any failure.
#
# NOTE: the module list is *discovered* from the filesystem instead of being
# hand-maintained. The previous hardcoded list had silently rotted: it still
# pointed at the deleted UniverSheet, at the pre-rename client / store /
# status-page identifiers (that family is now covered by
# scripts/check-legacy-residue.mjs), at the removed RecordingPage and at a
# chat/ComputerUsePendingModal that actually lives under
# components/computerUse — so the script could not pass anymore, and it was
# never wired into CI. Discovery removes that whole class of drift.

set -euo pipefail

PASS=0
FAIL=0
FAILED_FILES=()

check_module() {
  local url="http://localhost:1420/$1"
  local out status body
  out=$(curl -s -w '\n%{http_code}' "$url" 2>/dev/null || true)
  status=$(printf '%s\n' "$out" | tail -n 1)
  body=$(printf '%s\n' "$out" | sed -n '1p')
  # Vite answers unknown paths with the SPA index.html and HTTP 200, so a 200
  # alone proves nothing — the body has to look like a transformed module
  # rather than the HTML shell. Otherwise a deleted or renamed module would
  # still "pass" and the smoke test would carry no signal at all.
  if [ "$status" = "200" ] && ! printf '%s' "$body" | grep -qi '<!doctype html'; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_FILES+=("$1 (HTTP $status)")
    echo "  ❌ $1 → HTTP $status"
  fi
}

# collect <dir> <ext> — list source files, skipping tests and type shims
collect() {
  find "$1" -type f -name "*$2" \
    -not -path '*/__tests__/*' \
    -not -name '*.test.*' \
    -not -name '*.d.ts' \
    | sort
}

check_group() {
  # check_group <label> <dir> <ext>
  echo "── $1 ──"
  local found=0
  while IFS= read -r file; do
    if [ -n "$file" ]; then
      found=1
      check_module "$file"
    fi
  done < <(collect "$2" "$3")
  if [ "$found" = "0" ]; then
    echo "  ⚠️  no modules found under $2"
  fi
  echo ""
}

echo "🧪 UI Smoke Test — verifying all page/component modules"
echo ""

check_group "Pages" src/pages '.tsx'
check_group "Components" src/components '.tsx'
check_group "Lib" src/lib '.ts'
check_group "Stores" src/stores '.ts'

echo "── Types ──"
check_module "src/types/index.ts"
echo ""

echo "── i18n JSON validity ──"
for locale in en-US zh-CN; do
  if node -e "JSON.parse(require('fs').readFileSync('src/i18n/$locale.json','utf8'))" 2>/dev/null; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_FILES+=("i18n/$locale.json (invalid JSON)")
    echo "  ❌ i18n/$locale.json → invalid JSON"
  fi
done

echo ""
echo "════════════════════════════════════"
echo "  ✅ PASS: $PASS"
echo "  ❌ FAIL: $FAIL"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "  Failed:"
  for f in "${FAILED_FILES[@]}"; do
    echo "    - $f"
  done
  exit 1
else
  echo "  All checks passed."
  exit 0
fi
