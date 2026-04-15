import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Skill, SkillExecution } from '../types';
import builtInSkills from '../config/skills.json';

interface SkillState {
  skills: Skill[];
  executions: SkillExecution[];
  addSkill: (skill: Skill) => void;
  removeSkill: (id: string) => void;
  updateSkill: (id: string, updates: Partial<Skill>) => void;
  toggleSkill: (id: string) => void;
  addExecution: (execution: SkillExecution) => void;
  updateExecution: (id: string, updates: Partial<SkillExecution>) => void;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set) => ({
      skills: builtInSkills.builtIn.map(skill => ({
        ...skill,
        enabled: true,
        category: skill.category as 'built-in' | 'custom' | 'installed',
      })),
      executions: [],
      addSkill: (skill) => set((state) => ({ 
        skills: [...state.skills, skill] 
      })),
      removeSkill: (id) => set((state) => ({ 
        skills: state.skills.filter(s => s.id !== id) 
      })),
      updateSkill: (id, updates) => set((state) => ({
        skills: state.skills.map(s => 
          s.id === id ? { ...s, ...updates } : s
        )
      })),
      toggleSkill: (id) => set((state) => ({
        skills: state.skills.map(s => 
          s.id === id ? { ...s, enabled: !s.enabled } : s
        )
      })),
      addExecution: (execution) => set((state) => ({ 
        executions: [...state.executions, execution] 
      })),
      updateExecution: (id, updates) => set((state) => ({
        executions: state.executions.map(e => 
          e.id === id ? { ...e, ...updates } : e
        )
      })),
    }),
    {
      name: 'prefrontal-skill-storage',
    }
  )
);
