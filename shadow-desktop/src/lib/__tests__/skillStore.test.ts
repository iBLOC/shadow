import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/skills.json', () => ({
  default: {
    builtIn: [
      { id: 'skill-1', name: 'Skill One', description: 'First skill', category: 'built-in' },
      { id: 'skill-2', name: 'Skill Two', description: 'Second skill', category: 'built-in' },
    ],
  },
}));

describe('skillStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('loads built-in skills with enabled true', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { skills } = useSkillStore.getState();

    expect(skills).toHaveLength(2);
    expect(skills[0].enabled).toBe(true);
  });

  it('starts with empty executions', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { executions } = useSkillStore.getState();

    expect(executions).toEqual([]);
  });

  it('addSkill adds skill to list', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addSkill } = useSkillStore.getState();

    addSkill({ id: 'custom', name: 'Custom', description: 'Custom skill', category: 'custom', enabled: true });

    const { skills } = useSkillStore.getState();
    expect(skills).toHaveLength(3);
    expect(skills[2].id).toBe('custom');
  });

  it('removeSkill removes skill by id', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { removeSkill } = useSkillStore.getState();

    removeSkill('skill-1');

    const { skills } = useSkillStore.getState();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('skill-2');
  });

  it('updateSkill updates skill fields', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { updateSkill } = useSkillStore.getState();

    updateSkill('skill-1', { name: 'Updated Name' });

    const { skills } = useSkillStore.getState();
    expect(skills[0].name).toBe('Updated Name');
  });

  it('toggleSkill toggles enabled state', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { toggleSkill } = useSkillStore.getState();

    toggleSkill('skill-1');

    const { skills } = useSkillStore.getState();
    expect(skills[0].enabled).toBe(false);
  });

  it('toggleSkill enables disabled skill', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { toggleSkill } = useSkillStore.getState();

    toggleSkill('skill-1');
    toggleSkill('skill-1');

    const { skills } = useSkillStore.getState();
    expect(skills[0].enabled).toBe(true);
  });

  it('addExecution adds execution to list', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addExecution } = useSkillStore.getState();

    addExecution({ id: 'exec-1', skillId: 'skill-1', status: 'running', startedAt: new Date() });

    const { executions } = useSkillStore.getState();
    expect(executions).toHaveLength(1);
    expect(executions[0].id).toBe('exec-1');
  });

  it('updateExecution updates execution fields', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addExecution, updateExecution } = useSkillStore.getState();

    addExecution({ id: 'exec-1', skillId: 'skill-1', status: 'running', startedAt: new Date() });
    updateExecution('exec-1', { status: 'completed' });

    const { executions } = useSkillStore.getState();
    expect(executions[0].status).toBe('completed');
  });

  it('addSkill preserves existing skills', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addSkill } = useSkillStore.getState();

    addSkill({ id: 'custom', name: 'Custom', description: 'Custom skill', category: 'custom', enabled: true });

    const { skills } = useSkillStore.getState();
    expect(skills).toHaveLength(3);
    expect(skills[0].id).toBe('skill-1');
    expect(skills[1].id).toBe('skill-2');
    expect(skills[2].id).toBe('custom');
  });

  it('removeSkill preserves other skills', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { removeSkill } = useSkillStore.getState();

    removeSkill('skill-1');

    const { skills } = useSkillStore.getState();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('skill-2');
  });

  it('updateExecution only updates matching id', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addExecution, updateExecution } = useSkillStore.getState();

    addExecution({ id: 'exec-1', skillId: 'skill-1', status: 'running', startedAt: new Date() });
    addExecution({ id: 'exec-2', skillId: 'skill-2', status: 'running', startedAt: new Date() });
    updateExecution('exec-1', { status: 'completed' });

    const { executions } = useSkillStore.getState();
    expect(executions[0].status).toBe('completed');
    expect(executions[1].status).toBe('running');
  });
});