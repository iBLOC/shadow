#!/usr/bin/env bash
# cortex residue grep — usage from iBLOC shadow-mobile root
# Run this after a cortex→telencephalon rename pass to confirm no
# identifier references slipped. Exits 0 when clean, 1 when hits remain.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

PATTERNS=(
  'CortexStatus\b'
  'CortexState\b'
  'CortexConnection\b'
  'CortexProvider\b'
  'CortexClient\b'
  'cortexProvider\b'
  'cortexClient\b'
  'cortex_flows\b'
  'CortexFlows\b'
)

EXCLUDE_DIRS=(
  '.dart_tool'
  '.git'
  'build'
  'ios/Pods'
  'android/.gradle'
  'scripts'
  'lib/generated/l10n'
)

EXCLUDE_FILES=(
  '.flutter-plugins'
  '.flutter-plugins-dependencies'
  'pubspec.lock'
)

if command -v rg >/dev/null 2>&1; then
  ENGINE="rg"
else
  ENGINE="git grep"
fi

build_args() {
  local args=()
  if [ "$ENGINE" = "rg" ]; then
    args+=(--no-heading --line-number --color=never)
    for d in "${EXCLUDE_DIRS[@]}"; do
      args+=(-g "!$d/**" -g "!$d")
    done
    for f in "${EXCLUDE_FILES[@]}"; do
      args+=(-g "!$f")
    done
  else
    args+=(--line-number --extended-regexp)
    local -a git_excludes=()
    for d in "${EXCLUDE_DIRS[@]}"; do
      git_excludes+=(":!$d")
    done
    for f in "${EXCLUDE_FILES[@]}"; do
      git_excludes+=(":!$f")
    done
    args+=("${git_excludes[@]}")
  fi
  printf '%s\n' "${args[@]}"
}

ARGS=()
while IFS= read -r a; do ARGS+=("$a"); done < <(build_args)

hits=0
for pat in "${PATTERNS[@]}"; do
  if [ "$ENGINE" = "rg" ]; then
    out=$(rg "$pat" "${ARGS[@]}" . 2>/dev/null || true)
  else
    out=$(git grep -nI -E "$pat" "${ARGS[@]}" -- . 2>/dev/null || true)
  fi
  if [ -n "$out" ]; then
    echo "$out" | sed "s|^|$pat: |"
    hits=$((hits + $(echo "$out" | wc -l)))
  fi
done

if [ "$hits" -eq 0 ]; then
  echo "✓ cortex residue grep: 0 hits across shadow-mobile"
  exit 0
fi
echo "✗ cortex residue grep: $hits hits remaining — fix in next commit"
exit 1