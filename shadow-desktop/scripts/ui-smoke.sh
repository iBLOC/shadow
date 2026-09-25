#!/bin/bash
# UI smoke test — verifies every page/component module transforms
# through vite without errors. Run before every push.
#
# Usage: pnpm test:smoke
# Exits 1 on any failure.

set -euo pipefail

PASS=0
FAIL=0
FAILED_FILES=()

check_module() {
  local url="http://localhost:1420/$1"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [ "$status" = "200" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_FILES+=("$1 (HTTP $status)")
    echo "  ❌ $1 → HTTP $status"
  fi
}

echo "🧪 UI Smoke Test — verifying all page/component modules"
echo ""

echo "── Pages ──"
for page in \
  pages/ConversationPage.tsx \
  pages/TaskBoardPage.tsx \
  pages/MCPPage.tsx \
  pages/SkillsPage.tsx \
  pages/MemoryPage.tsx \
  pages/LogsPage.tsx \
  pages/SettingsPage.tsx \
  pages/DiscoveryPage.tsx \
  pages/FlowsPage.tsx \
  pages/TracePage.tsx \
  pages/CortexStatusPage.tsx \
  pages/RecordingPage.tsx \
  pages/ComputerUsePage.tsx \
  pages/PreviewsPage.tsx \
  pages/DocumentPage.tsx \
  pages/WorkflowStudioPage.tsx \
  pages/ModelsPage.tsx \
  pages/VoicePage.tsx \
  pages/GroupPage.tsx \
  pages/ProvidersPage.tsx \
  pages/ResonancePage.tsx; do
  check_module "src/$page"
done

echo ""
echo "── Components ──"
for comp in \
  components/chat/AudioEventChip \
  components/chat/FeishuPublishedCard \
  components/chat/ComputerUsePendingModal \
  components/chat/VisualQaClarificationChip \
  components/chat/ToolOutputCard \
  components/chat/ToolApprovalCard \
  components/chat/ClientToolForm \
  components/chat/AgentClarificationDialog \
  components/document/UniverSheet \
  components/preview/PreviewButton \
  components/task/TaskDetailDialog \
  components/Layout \
  components/AppInitializer; do
  check_module "src/$comp.tsx"
done

echo ""
echo "── Lib / Stores / Types ──"
for lib in \
  lib/cortexClient \
  stores/conversationStore \
  stores/taskBoardDataStore \
  stores/cortexStore \
  stores/resonanceStore \
  types/index; do
  check_module "src/$lib.ts"
done

echo ""
echo "── i18n JSON validity ──"
for locale in en-US zh-CN; do
  if python -c "import json; json.load(open('src/i18n/$locale.json'))" 2>/dev/null; then
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