import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { AppInitializer } from './components/AppInitializer';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { GlobalErrorDialog } from './components/error/GlobalErrorDialog';
import { ShortcutManager } from './components/ShortcutManager';
import { installGlobalErrorHandlers } from './lib/errorTriggers';
import { migrateFromLocalStorage } from './lib/migrateSettings';
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
import './App.css';

function App() {
  useEffect(() => {
    installGlobalErrorHandlers();
    migrateFromLocalStorage();
  }, []);

  return (
    <BrowserRouter>
      <GlobalErrorDialog />
      <ShortcutManager />
      <PWAInstallPrompt />
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/onboarding" element={<ModelOnboardingPage />} />
        <Route path="/" element={<AppInitializer><Layout /></AppInitializer>}>
          <Route index element={<TaskBoardPage />} />
          <Route path="tasks" element={<TaskBoardPage />} />
          <Route path="conversation" element={<ConversationPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="models/download" element={<ModelDownloadPage />} />
          <Route path="voice" element={<VoicePage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="mcp" element={<MCPPage />} />
          <Route path="skills" element={<SkillsPage />} />
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
