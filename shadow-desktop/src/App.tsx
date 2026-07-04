import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AppInitializer } from './components/AppInitializer';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { GlobalErrorDialog } from './components/error/GlobalErrorDialog';
import { TaskBoardPage } from './pages/TaskBoardPage';
import { ConversationPage } from './pages/ConversationPage';
import { AgentsPage } from './pages/AgentsPage';
import { MCPPage } from './pages/MCPPage';
import { SkillsPage } from './pages/SkillsPage';
import { MemoryPage } from './pages/MemoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ModelsPage } from './pages/ModelsPage';
import { SetupPage } from './pages/SetupPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { LogsPage } from './pages/LogsPage';
import { ModelDownloadPage } from './pages/ModelDownloadPage';
import { VoicePage } from './pages/VoicePage';
import { FlowsPage } from './pages/FlowsPage';
import { GroupPage } from './pages/GroupPage';
import { PromptSettingsPage } from './pages/PromptSettingsPage';
import { ServicesPage } from './pages/ServicesPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <GlobalErrorDialog />
      <PWAInstallPrompt />
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<AppInitializer><Layout /></AppInitializer>}>
          <Route index element={<TaskBoardPage />} />
          <Route path="tasks" element={<TaskBoardPage />} />
          <Route path="conversation" element={<ConversationPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="models/download" element={<ModelDownloadPage />} />
          <Route path="voice" element={<VoicePage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="mcp" element={<MCPPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="discovery" element={<DiscoveryPage />} />
          <Route path="flows" element={<FlowsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
