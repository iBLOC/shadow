import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSkillStore } from '../stores/skillStore';
import {
  Brain,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Play,
  Settings
} from 'lucide-react';
import type { Skill } from '../types';
import { FormCard, FormGroup } from '../components/business';
import { Button } from '../components/ui/button';

export function SkillsPage() {
  const { t } = useTranslation();
  const { skills, addSkill, removeSkill, toggleSkill } = useSkillStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSkill, setNewSkill] = useState<Partial<Skill>>({
    name: '', description: '', category: 'custom', enabled: true,
  });

  const handleAddSkill = () => {
    if (!newSkill.name || !newSkill.description) return;
    const skill: Skill = {
      id: crypto.randomUUID(),
      name: newSkill.name,
      description: newSkill.description,
      category: 'custom',
      enabled: newSkill.enabled ?? true,
    };
    addSkill(skill);
    setShowAddForm(false);
    setNewSkill({ name: '', description: '', category: 'custom', enabled: true });
  };

  const categories = ['built-in', 'custom', 'installed'] as const;

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'built-in': return t('skills.builtIn');
      case 'custom': return t('skills.custom');
      case 'installed': return t('skills.installed');
      default: return category;
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('skills.title')}</h1>
          <p className="subtitle">{t('skills.subtitle')}</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} icon={<Plus size={18} />}>
          {t('skills.addSkill')}
        </Button>
      </header>

      {showAddForm && (
        <FormCard
          title={t('skills.addSkill')}
          onCancel={() => setShowAddForm(false)}
          onSubmit={handleAddSkill}
          cancelLabel={t('common.cancel')}
          submitLabel={t('skills.addSkill')}
        >
          <FormGroup label={t('common.name')}>
            <input
              type="text"
              value={newSkill.name || ''}
              onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
              placeholder={t('skills.myCustomSkill')}
            />
          </FormGroup>
          <FormGroup label={t('common.description')}>
            <textarea
              value={newSkill.description || ''}
              onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
              placeholder={t('skills.whatDoesSkillDo')}
              rows={3}
            />
          </FormGroup>
        </FormCard>
      )}

      {categories.map((category) => {
        const categorySkills = skills.filter((s) => s.category === category);
        if (categorySkills.length === 0) return null;
        return (
          <div key={category} className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-base font-semibold text-foreground">{getCategoryTitle(category)}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {categorySkills.map((skill) => (
                <div key={skill.id} className="flex justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:border-foreground/30">
                  <div className="flex flex-1 gap-3">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground">
                      {skill.icon || <Brain size={24} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 text-base font-semibold text-foreground">{skill.name}</h3>
                      <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{skill.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleSkill(skill.id)}
                      title={skill.enabled ? t('common.disabled') : t('common.enabled')}
                      aria-label={skill.enabled ? t('common.disabled') : t('common.enabled')}
                    >
                      {skill.enabled ? (
                        <ToggleRight size={20} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={20} />
                      )}
                    </Button>
                    {skill.category !== 'built-in' && (
                      <>
                        <Button size="icon" variant="ghost" title={t('skills.execute')} aria-label={t('skills.execute')}>
                          <Play size={16} />
                        </Button>
                        <Button size="icon" variant="ghost" title={t('skills.skillSettings')} aria-label={t('skills.skillSettings')}>
                          <Settings size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeSkill(skill.id)}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
