import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMemoryStore } from '../stores/memoryStore';
import { 
  Database, 
  Search, 
  Plus, 
  Trash2, 
  Layers,
  Clock,
  Brain
} from 'lucide-react';
import type { Memory } from '../types';
import { format } from 'date-fns';
import { FormCard, FormGroup, FormRow } from '../components/business';
import './MemoryPage.css';

export function MemoryPage() {
  const { t } = useTranslation();
  const { memories, searchResults, isLoading, error, searchMemories, addMemory, removeMemory } = useMemoryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDimension, setSelectedDimension] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemory, setNewMemory] = useState<Partial<Memory>>({
    content: '',
    dimension: 'Agent',
    layer: 'L2',
  });

  const handleSearch = () => {
    searchMemories(searchQuery, selectedDimension || undefined);
  };

  const handleAddMemory = () => {
    if (!newMemory.content) return;
    
    const memory: Memory = {
      id: crypto.randomUUID(),
      uri: `memory://${Date.now()}`,
      content: newMemory.content,
      dimension: newMemory.dimension as Memory['dimension'] || 'Agent',
      layer: newMemory.layer as Memory['layer'] || 'L2',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    addMemory(memory);
    setShowAddForm(false);
    setNewMemory({ content: '', dimension: 'Agent', layer: 'L2' });
  };

  const getDimensionColor = (dimension: string) => {
    switch (dimension) {
      case 'User': return '#3b82f6';
      case 'Agent': return '#8b5cf6';
      case 'Session': return '#10b981';
      case 'Resources': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const displayMemories = searchResults.length > 0 
    ? searchResults.map(r => r.memory)
    : memories;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('memory.title')}</h1>
          <p className="subtitle">{t('memory.subtitle')}</p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={18} />
          {t('memory.addMemory')}
        </button>
      </header>

      <div className="search-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('memory.searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <select
          value={selectedDimension}
          onChange={(e) => setSelectedDimension(e.target.value)}
        >
          <option value="">{t('memory.allDimensions')}</option>
          <option value="User">{t('memory.user')}</option>
          <option value="Agent">{t('memory.agent')}</option>
          <option value="Session">{t('memory.session')}</option>
          <option value="Resources">{t('memory.resources')}</option>
        </select>
        <button className="btn btn-primary" onClick={handleSearch} disabled={isLoading}>
          {isLoading ? t('common.loading') : t('common.search')}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {showAddForm && (
        <FormCard
          title={t('memory.addMemory')}
          onCancel={() => setShowAddForm(false)}
          onSubmit={handleAddMemory}
          cancelLabel={t('common.cancel')}
          submitLabel={t('common.save')}
        >
          <FormGroup label={t('common.description')}>
            <textarea
              value={newMemory.content || ''}
              onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
              placeholder={t('memory.searchPlaceholder')}
              rows={4}
            />
          </FormGroup>
          <FormRow>
            <FormGroup label={t('memory.dimension')}>
              <select
                value={newMemory.dimension || 'Agent'}
                onChange={(e) => setNewMemory({ ...newMemory, dimension: e.target.value as Memory['dimension'] })}
              >
                <option value="User">{t('memory.user')}</option>
                <option value="Agent">{t('memory.agent')}</option>
                <option value="Session">{t('memory.session')}</option>
                <option value="Resources">{t('memory.resources')}</option>
              </select>
            </FormGroup>
            <FormGroup label={t('memory.layer')}>
              <select
                value={newMemory.layer || 'L2'}
                onChange={(e) => setNewMemory({ ...newMemory, layer: e.target.value as Memory['layer'] })}
              >
                <option value="L0">{t('memory.layerL0')}</option>
                <option value="L1">{t('memory.layerL1')}</option>
                <option value="L2">{t('memory.layerL2')}</option>
              </select>
            </FormGroup>
          </FormRow>
        </FormCard>
      )}

      {searchResults.length > 0 && (
        <div className="search-results-info">
          <Brain size={16} />
          {t('memory.foundResults', { count: searchResults.length })}
        </div>
      )}

      <div className="memory-list">
        {displayMemories.length === 0 ? (
          <div className="empty-state">
            <Database size={48} strokeWidth={1} />
            <p>{t('memory.noMemories')}</p>
            <p className="hint">{t('memory.noMemoriesHint')}</p>
          </div>
        ) : (
          displayMemories.map((memory) => (
            <div key={memory.id} className="card memory-card">
              <div className="memory-header">
                <div className="memory-tags">
                  <span 
                    className="tag dimension-tag"
                    style={{ background: getDimensionColor(memory.dimension) }}
                  >
                    {t(`memory.${memory.dimension.toLowerCase()}`)}
                  </span>
                  <span className="tag layer-tag">
                    <Layers size={12} />
                    {memory.layer}
                  </span>
                </div>
                <button
                  className="btn btn-icon btn-danger btn-small"
                  onClick={() => removeMemory(memory.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="memory-content">
                {memory.content}
              </div>
              <div className="memory-meta">
                <span className="meta-item">
                  <Clock size={12} />
                  {format(new Date(memory.createdAt), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
