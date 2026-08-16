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
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

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
        <Button onClick={() => setShowAddForm(!showAddForm)} icon={<Plus size={18} />}>
          {t('memory.addMemory')}
        </Button>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[300px] flex-1 items-center gap-3 rounded-lg border border-border bg-card px-4">
          <Search size={18} className="text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('memory.searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 border-none bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <Select value={selectedDimension} onValueChange={setSelectedDimension}>
          <SelectTrigger className="min-w-[160px]">
            <SelectValue placeholder={t('memory.allDimensions')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('memory.allDimensions')}</SelectItem>
            <SelectItem value="User">{t('memory.user')}</SelectItem>
            <SelectItem value="Agent">{t('memory.agent')}</SelectItem>
            <SelectItem value="Session">{t('memory.session')}</SelectItem>
            <SelectItem value="Resources">{t('memory.resources')}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? t('common.loading') : t('common.search')}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
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
              <Select
                value={newMemory.dimension || 'Agent'}
                onValueChange={(v) => setNewMemory({ ...newMemory, dimension: v as Memory['dimension'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">{t('memory.user')}</SelectItem>
                  <SelectItem value="Agent">{t('memory.agent')}</SelectItem>
                  <SelectItem value="Session">{t('memory.session')}</SelectItem>
                  <SelectItem value="Resources">{t('memory.resources')}</SelectItem>
                </SelectContent>
              </Select>
            </FormGroup>
            <FormGroup label={t('memory.layer')}>
              <Select
                value={newMemory.layer || 'L2'}
                onValueChange={(v) => setNewMemory({ ...newMemory, layer: v as Memory['layer'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L0">{t('memory.layerL0')}</SelectItem>
                  <SelectItem value="L1">{t('memory.layerL1')}</SelectItem>
                  <SelectItem value="L2">{t('memory.layerL2')}</SelectItem>
                </SelectContent>
              </Select>
            </FormGroup>
          </FormRow>
        </FormCard>
      )}

      {searchResults.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Brain size={16} />
          {t('memory.foundResults', { count: searchResults.length })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {displayMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
            <Database size={48} strokeWidth={1} />
            <p className="mt-3 text-sm">{t('memory.noMemories')}</p>
            <p className="mt-1 text-xs">{t('memory.noMemoriesHint')}</p>
          </div>
        ) : (
          displayMemories.map((memory) => (
            <div key={memory.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                    {t(`memory.${memory.dimension.toLowerCase()}`)}
                  </span>
                  <span className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Layers size={12} />
                    {memory.layer}
                  </span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeMemory(memory.id)} aria-label={t('common.delete')}>
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="mb-3 text-sm leading-relaxed text-foreground">{memory.content}</div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
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
