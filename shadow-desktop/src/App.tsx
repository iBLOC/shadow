import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AppInitializer } from './components/AppInitializer';
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
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<AppInitializer><Layout /></AppInitializer>}>
          <Route index element={<TaskBoardPage />} />
          <Route path="tasks" element={<TaskBoardPage />} />
          <Route path="conversation" element={<ConversationPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="mcp" element={<MCPPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="discovery" element={<DiscoveryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
