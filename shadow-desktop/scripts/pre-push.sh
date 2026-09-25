#!/bin/bash
# Pre-push validation — runs all checks that can run without
# a running app or real hardware. Usage: pnpm test:pre-push
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🔍 Pre-push validation"
echo "══════════════════════"

echo ""
echo "▶ TypeScript check"
npx tsc -b --pretty 2>&1 | grep -E "error TS" && { echo "❌ TypeScript errors"; exit 1; } || echo "  ✅ No TS errors"

echo ""
echo "▶ Vitest unit tests"
npx vitest run --reporter=verbose 2>&1 | tail -5

echo ""
echo "▶ Rust cargo check"
(cd src-tauri && cargo check --lib 2>&1 | grep -E "^error" && { echo "❌ Rust errors"; exit 1; } || echo "  ✅ No Rust errors")

echo ""
echo "══════════════════════"
echo "  All pre-push checks passed."
