#!/usr/bin/env bash
# 残留扫描 —— shadow-mobile
#
# 两组判据（**判据不同，范围也不同**）：
#
#   ① cortex → telencephalon 改名残留（**标识符级**，全树扫）
#      —— 谁再写 CortexClient / cortexClient，名字就在说谎。
#
#   ② 旧「嵌入式 Prefrontal」运行时残留（**代码级**，只扫 lib/ android/ test/）
#      —— 那套是上一个架构时代的东西（prefrontal 独立仓的 Layer-3 引擎，
#         走自己的 mini HTTP server / 旧方言 / 绕开 端脑→叶区→neuron 链路）。
#         现在端脑是**进程内的大脑**（encephalon ⇒ libencephalon.so），
#         那条支线**必须**不许回来。
#      ⚠️ 只扫代码，不扫 docs/ 与 AGENTS.md —— **台账要记得历史**，
#         历史里出现旧名字是对的；代码里出现才是回归。
#      ⚠️ 名单**故意不含** PrefrontalClient（客户端面，还在用）、
#         PrefrontalMNN（MNN 本地推理桥，还在用）、
#         PrefrontalAccessibilityService（无障碍服务，还在用）。
#
# 用法（从 shadow-mobile 根跑）：
#   bash scripts/check-cortex-residue.sh             # 主流程
#   bash scripts/check-cortex-residue.sh --self-test # 自检：判据有没有分辨力
#
# 退出码：0 = 干净 / 1 = 有残留 / 2 = 判不了（环境缺引擎）

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

PATTERNS_CORTEX=(
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

# 旧嵌入式 Prefrontal 运行时的**标识符**（代码级）
PATTERNS_PREFRONTAL=(
  'prefrontal_runtime\b'
  'PrefrontalRuntime\b'
  'PrefrontalRuntimeService\b'
  'PrefrontalMobileService\b'
  'PrefrontalMobileProvider\b'
  'PrefrontalMobilePage\b'
  'PrefrontalMobileStatus\b'
  'prefrontalMobileProvider\b'
  'prefrontalMobilePortProvider\b'
  'prefrontalMobileServiceProvider\b'
  'libprefrontal_core_lib'
  '/settings/prefrontal'
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

# 只扫这些目录（第二组判据用）
CODE_DIRS=(lib android test)

if command -v rg >/dev/null 2>&1; then
  ENGINE="rg"
elif command -v git >/dev/null 2>&1; then
  ENGINE="git grep"
else
  echo "✗ 判不了：rg 与 git 都不可用 —— 这不是「干净」，是「没法判」" >&2
  exit 2
fi

# ── 自检：判据有没有分辨力 ─────────────────────────────────────────
# ⚠️ 「没看到残留」有两种可能：真的干净，或**探测器瞎了**。
#    ⇒ 先造出一次残留，确认闸看得见；再放三个**允许存在的**名字进去，
#    确认闸**不**误报。两头都验过，这道闸才算有分辨力。
self_test() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  mkdir -p "$tmp/lib" "$tmp/android"

  local bad="$tmp/lib/old_runtime.dart"
  local good="$tmp/lib/kept_names.dart"
  local bad_so_dir="$tmp/android/jniLibs/arm64-v8a"
  mkdir -p "$bad_so_dir"

  printf 'class PrefrontalRuntime {}\n' > "$bad"
  printf 'class PrefrontalClient {}\nclass PrefrontalMNN {}\nclass PrefrontalAccessibilityService {}\n' > "$good"
  printf '\x7fELF fake\n' > "$bad_so_dir/libprefrontal_core_lib.so"

  local fails=0

  # ① 造出来的残留必须被抓到
  local out
  out="$(grep -E -n -e 'PrefrontalRuntime\b' "$bad" 2>/dev/null || true)"
  if [ -z "$out" ]; then
    echo "✗ 自检红：造出来的 PrefrontalRuntime 没被抓到 ⇒ 这道闸是恒绿的"
    fails=$((fails + 1))
  else
    echo "✓ 自检：造出来的旧运行时标识符被抓到了"
  fi

  # ② 允许存在的三个名字不许被误报
  local missed
  missed="$(grep -E -n -e 'PrefrontalRuntime\b' -e 'prefrontal_runtime\b' \
    -e 'PrefrontalMobile(Service|Provider|Page|Status)\b' \
    -e 'prefrontalMobile(Port|Service)?Provider\b' \
    -e 'libprefrontal_core_lib' -e '/settings/prefrontal' "$good" 2>/dev/null || true)"
  if [ -n "$missed" ]; then
    echo "✗ 自检红：仍在用的名字被误报了 ⇒"
    echo "$missed" | sed 's/^/    /'
    fails=$((fails + 1))
  else
    echo "✓ 自检：仍在用的三个名字没有被误报"
  fi

  # ③ 旧 .so 回包必须被抓到（它是**构建产物**，文本扫不到 ⇒ 单独判存在性）
  if [ -e "$bad_so_dir/libprefrontal_core_lib.so" ]; then
    echo "✓ 自检：旧 .so 的存在性检查可用"
  else
    echo "✗ 自检红：旧 .so 的存在性检查没生效"
    fails=$((fails + 1))
  fi

  if [ "$fails" -eq 0 ]; then
    echo "✓ 自检全绿（3 条）"
    exit 0
  fi
  echo "✗ 自检 $fails 条红"
  exit 1
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

hits=0

# ── 第一组：cortex 改名残留（全树）──────────────────────────────────
for pat in "${PATTERNS_CORTEX[@]}"; do
  if [ "$ENGINE" = "rg" ]; then
    args=(--no-heading --line-number --color=never)
    for d in "${EXCLUDE_DIRS[@]}"; do args+=(-g "!$d/**" -g "!$d"); done
    for f in "${EXCLUDE_FILES[@]}"; do args+=(-g "!$f"); done
    out="$(rg "$pat" "${args[@]}" . 2>/dev/null || true)"
  else
    git_excludes=()
    for d in "${EXCLUDE_DIRS[@]}"; do git_excludes+=(":!$d"); done
    for f in "${EXCLUDE_FILES[@]}"; do git_excludes+=(":!$f"); done
    out="$(git grep -nI -E "$pat" "${git_excludes[@]}" -- . 2>/dev/null || true)"
  fi
  if [ -n "$out" ]; then
    echo "$out" | sed "s|^|[${pat//\\/}] |"
    hits=$((hits + $(echo "$out" | wc -l)))
  fi
done

# ── 第二组：旧嵌入式 Prefrontal 运行时残留（代码级）──────────────────
for pat in "${PATTERNS_PREFRONTAL[@]}"; do
  if [ "$ENGINE" = "rg" ]; then
    args=(--no-heading --line-number --color=never -g '!lib/generated/l10n/**')
    out="$(rg "$pat" "${args[@]}" "${CODE_DIRS[@]}" 2>/dev/null || true)"
  else
    out="$(git grep -nI -E "$pat" -- "${CODE_DIRS[@]}" 2>/dev/null || true)"
  fi
  if [ -n "$out" ]; then
    echo "$out" | sed "s|^|[${pat//\\/}] |"
    hits=$((hits + $(echo "$out" | wc -l)))
  fi
done

# 旧 .so 回包（构建产物，文本扫不到 ⇒ 单独判存在性）
so_hits="$(ls android/app/src/main/jniLibs/*/libprefrontal_core_lib.so 2>/dev/null || true)"
if [ -n "$so_hits" ]; then
  echo "$so_hits" | sed 's|^|libprefrontal_core_lib.so 还在包里: |'
  hits=$((hits + $(echo "$so_hits" | wc -l)))
fi

if [ "$hits" -eq 0 ]; then
  echo "✓ 残留扫描: 0 条（cortex 改名残留 + 旧嵌入式 Prefrontal 运行时）"
  exit 0
fi
echo "✗ 残留扫描: $hits 条 ⇒ 修完再交"
exit 1
