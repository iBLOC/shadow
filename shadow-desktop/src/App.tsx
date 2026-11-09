import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { AppInitializer } from './components/AppInitializer';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { GlobalErrorDialog } from './components/error/GlobalErrorDialog';
import { ShortcutManager } from './components/ShortcutManager';
import { installGlobalErrorHandlers } from './lib/errorTriggers';
import { migrateFromLocalStorage } from './lib/migrateSettings';
import { migrateLegacyTenant } from './lib/tenantMigration';
import { isTauri } from './lib/platform';
import { safeEventListen } from './lib/tauriSafe';
import { notify, notifyIfWindowHidden } from './lib/notify';
import { startReminderPoller } from './lib/reminderInbox';
import { telencephalonClient } from './lib/telencephalonClient';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from './stores/themeStore';
import { useIdentityStore } from './stores/identityStore';
import { TaskBoardPage } from './pages/TaskBoardPage';
import { ConversationPage } from './pages/ConversationPage';
import { MCPPage } from './pages/MCPPage';
import { SkillsPage } from './pages/SkillsPage';
import { MemoryPage } from './pages/MemoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ModelsPage } from './pages/ModelsPage';
import { SetupPage } from './pages/SetupPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { LogsPage } from './pages/LogsPage';
import { TelencephalonStatusPage } from './pages/TelencephalonStatusPage';
import { ModelDownloadPage } from './pages/ModelDownloadPage';
import { VoicePage } from './pages/VoicePage';
import { FlowsPage } from './pages/FlowsPage';
import { GroupPage } from './pages/GroupPage';
import { ResonancePage } from './pages/ResonancePage';
import { ModelOnboardingPage } from './pages/ModelOnboardingPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { TracePage } from './pages/TracePage';
import { DocumentPage } from './pages/DocumentPage';
import { PreviewsPage } from './pages/PreviewsPage';
import { ComputerUsePage } from './pages/ComputerUsePage';
import { WorkflowStudioPage } from './pages/WorkflowStudioPage';
import { JdmEditorPage } from './pages/JdmEditorPage';
import { PromptSettingsPage } from './pages/PromptSettingsPage';
import './App.css';

function App() {
  const { t } = useTranslation();
  useEffect(() => {
    installGlobalErrorHandlers();
    migrateFromLocalStorage();
    void (async () => {
      // 顺序是有讲究的：**先定是谁 → 再搬旧记忆 → 最后读记忆**。
      //
      // 1. 租户由端脑说了算（`GET /shadow/v1/identity`）：有账号就是那个
      //    人格，没账号才是 `"default"`（老部署逐字节不变）。
      // 2. 一次性迁移把 `"default"` 桶里的记忆与任务复制到人格桶。**必须
      //    在读记忆之前** —— 主题色就住在旧桶里，先读就会读不到，界面
      //    会「丢」掉用户的主题色。
      // 3. 主题色记忆的恢复排在迁移之后。
      const tenant = await useIdentityStore.getState().resolve();
      try {
        const migrated = await migrateLegacyTenant(tenant);
        if (migrated.ran) {
          console.info(
            `[identity] 租户迁移 → ${tenant}：记忆 ${migrated.memoriesCopied} 条、任务 ${migrated.tasksCopied} 条` +
              (migrated.errors.length ? `（${migrated.errors.length} 条出错，下次会再试）` : '')
          );
        }
      } catch (e) {
        console.warn('[identity] 租户迁移失败:', e);
      }
      // 「主题色也是记忆的一部分」—— 启动时把影子在海马体里记住的外观偏好
      // 恢复回来。读不到（端脑没起 / 离线）就继续用本地那一份，不报错。
      void useThemeStore.getState().hydrateFromMemory();
    })();
  }, []);

  // v2.9 — 后台通知：mTLS 连接**断在后台**（窗口藏在托盘）时给用户一个出口。
  // ⚠️ 现有事件（ws_connected / ws_disconnected，ws_client.rs 发的）此前在
  // 前端**零监听** ⇒ 断了没人知道；这里只补「藏着的窗口」这一格 ——
  // 可见时用户正看着界面，弹通知是打扰（notifyIfWindowHidden 里拦）。
  // web 构建没有这条事件链 ⇒ isTauri() 拦掉。
  // 独立 effect（不跟启动迁移挤一个）：语言切换重挂这条监听是便宜的，
  // 重跑迁移不是。
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    void safeEventListen<void>('ws_disconnected', () => {
      void notifyIfWindowHidden(
        t('notifications.wsDisconnectedTitle'),
        t('notifications.wsDisconnectedBody'),
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [t]);

  // v2.11 — **提醒（通知）轮询** —— 端脑响了 ⇒ ⇒ 把它送到用户眼前。
  //
  // ⚠️ 端脑以前**在生产上从不构造**调度器 ⇒ ⇒ 用户在对话里说「提前 10 分钟
  // 提醒我」⇒ ⇒ 提醒存进任务库 ⇒ ⇒ **永远不响** ⇒ ⇒ 而每一步都成功
  // ⇒ ⇒ 失败长得像成功。现在端脑会响了 ⇒ ⇒ 这一段是「收到」那个出口。
  //
  // ⚠️ **只有真的送出去了才确认** —— 送不出去（没系统通知权限 / 不是
  // Tauri）⇒ ⇒ 那条提醒**留在端脑的待办里** ⇒ ⇒ 下个周期再送 ⇒ ⇒ 绝不
  // 确认掉一条用户没看到的提醒（那会让提醒**静默消失**）。
  useEffect(() => {
    const stop = startReminderPoller({
      source: telencephalonClient,
      deliver: async (n) => {
        const body =
          n.notification_type === 'Overdue'
            ? t('reminders.overdue', { title: n.task_title })
            : n.notification_type === 'NeedsConfirmation'
              ? t('reminders.confirm', { title: n.task_title })
              : t('reminders.reminder', { title: n.task_title });
        return notify(t('reminders.title'), body);
      },
      onError: (e) => console.warn('[reminders]', e),
    });
    return stop;
  }, [t]);

  return (
    <BrowserRouter>
      <GlobalErrorDialog />
      <ShortcutManager />
      <PWAInstallPrompt />
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/onboarding" element={<ModelOnboardingPage />} />
        <Route path="/" element={<AppInitializer><Layout /></AppInitializer>}>
          {/* 对话为主：默认落地页是对话，不是任务看板。
              重定向而不是直接渲染，是为了让侧栏的「对话」项保持高亮。 */}
          <Route index element={<Navigate to="/conversation" replace />} />
          <Route path="tasks" element={<TaskBoardPage />} />
          <Route path="conversation" element={<ConversationPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="models/download" element={<ModelDownloadPage />} />
          <Route path="voice" element={<VoicePage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="mcp" element={<MCPPage />} />
          <Route path="jdm-editor" element={<JdmEditorPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="prompt-settings" element={<PromptSettingsPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="document/:taskId" element={<DocumentPage />} />
          <Route path="previews" element={<PreviewsPage />} />
          <Route path="computer-use" element={<ComputerUsePage />} />
          <Route path="workflow-studio" element={<WorkflowStudioPage />} />
          <Route path="cortex-status" element={<TelencephalonStatusPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="discovery" element={<DiscoveryPage />} />
          <Route path="flows" element={<FlowsPage />} />
          <Route path="resonance" element={<ResonancePage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="trace" element={<TracePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
