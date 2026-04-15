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
import './SkillsPage.css';

export function SkillsPage() {
  const { t } = useTranslation();
  const { skills, addSkill, removeSkill, toggleSkill } = useSkillStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSkill, setNewSkill] = useState<Partial<Skill>>({
    name: '',
    description: '',
    category: 'custom',
    enabled: true,
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
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={18} />
          {t('skills.addSkill')}
        </button>
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
          <div key={category} className="skill-section">
            <h2 className="section-title">{getCategoryTitle(category)}</h2>
            <div className="skill-grid">
              {categorySkills.map((skill) => (
                <div key={skill.id} className="card skill-card">
                  <div className="skill-header">
                    <div className="skill-icon">
                      {skill.icon || <Brain size={24} />}
                    </div>
                    <div className="skill-info">
                      <h3>{skill.name}</h3>
                      <p>{skill.description}</p>
                    </div>
                  </div>
                  <div className="skill-actions">
                    <button
                      className="btn btn-icon"
                      onClick={() => toggleSkill(skill.id)}
                      title={skill.enabled ? t('common.disabled') : t('common.enabled')}
                    >
                      {skill.enabled ? (
                        <ToggleRight size={20} className="toggle-on" />
                      ) : (
                        <ToggleLeft size={20} />
                      )}
                    </button>
                    {skill.category !== 'built-in' && (
                      <>
                        <button className="btn btn-icon" title={t('skills.execute')}>
                          <Play size={16} />
                        </button>
                        <button className="btn btn-icon" title={t('skills.skillSettings')}>
                          <Settings size={16} />
                        </button>
                        <button
                          className="btn btn-icon btn-danger"
                          onClick={() => removeSkill(skill.id)}
                          title={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
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
