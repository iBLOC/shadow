import { describe, it, expect, beforeEach } from 'vitest';
import { useSkillStore } from '../../src/stores/skillStore';
import type { Skill, SkillExecution } from '../../src/types';

const sampleSkill: Skill = {
 id: 'skill-1',
 name: 'My Custom Skill',
 description: 'A custom skill for testing',
 category: 'custom',
 enabled: true,
};

const sampleExecution: SkillExecution = {
 id: 'exec-1',
 skillId: 'skill-1',
 status: 'pending',
 input: { query: 'test' },
 startedAt: new Date('2024-01-01T10:00:00Z'),
};

describe('SkillStore', () => {
 beforeEach(() => {
 localStorage.clear();
 useSkillStore.setState({
 skills: [],
 executions: [],
 });
 });

 describe('initial state', () => {
 it('starts with empty skills and executions when set', () => {
 const state = useSkillStore.getState();
 expect(state.skills).toEqual([]);
 expect(state.executions).toEqual([]);
 });

 it('exposes addSkill, removeSkill, updateSkill, toggleSkill, addExecution, updateExecution', () => {
 const state = useSkillStore.getState();
 expect(typeof state.addSkill).toBe('function');
 expect(typeof state.removeSkill).toBe('function');
 expect(typeof state.updateSkill).toBe('function');
 expect(typeof state.toggleSkill).toBe('function');
 expect(typeof state.addExecution).toBe('function');
 expect(typeof state.updateExecution).toBe('function');
 });
 });

 describe('addSkill', () => {
 it('appends skill to list', () => {
 const { addSkill } = useSkillStore.getState();
 addSkill(sampleSkill);

 expect(useSkillStore.getState().skills).toHaveLength(1);
 expect(useSkillStore.getState().skills[0]).toEqual(sampleSkill);
 });

 it('preserves order when adding multiple', () => {
 const { addSkill } = useSkillStore.getState();
 addSkill(sampleSkill);
 addSkill({ ...sampleSkill, id: 'skill-2', name: 'Skill Two' });

 const skills = useSkillStore.getState().skills;
 expect(skills).toHaveLength(2);
 expect(skills[0].id).toBe('skill-1');
 expect(skills[1].id).toBe('skill-2');
 });
 });

 describe('removeSkill', () => {
 it('removes skill by id', () => {
 useSkillStore.setState({ skills: [sampleSkill] });
 const { removeSkill } = useSkillStore.getState();

 removeSkill('skill-1');

 expect(useSkillStore.getState().skills).toHaveLength(0);
 });

 it('leaves other skills untouched', () => {
 const second = { ...sampleSkill, id: 'skill-2' };
 useSkillStore.setState({ skills: [sampleSkill, second] });
 const { removeSkill } = useSkillStore.getState();

 removeSkill('skill-1');

 const remaining = useSkillStore.getState().skills;
 expect(remaining).toHaveLength(1);
 expect(remaining[0].id).toBe('skill-2');
 });
 });

 describe('updateSkill', () => {
 it('merges updates into matching skill', () => {
 useSkillStore.setState({ skills: [sampleSkill] });
 const { updateSkill } = useSkillStore.getState();

 updateSkill('skill-1', { name: 'Updated Name' });

 const updated = useSkillStore.getState().skills[0];
 expect(updated.name).toBe('Updated Name');
 expect(updated.id).toBe('skill-1');
 expect(updated.description).toBe(sampleSkill.description);
 });
 });

 describe('toggleSkill', () => {
 it('flips enabled from true to false', () => {
 useSkillStore.setState({ skills: [sampleSkill] });
 const { toggleSkill } = useSkillStore.getState();

 toggleSkill('skill-1');

 expect(useSkillStore.getState().skills[0].enabled).toBe(false);
 });

 it('flips enabled from false to true', () => {
 useSkillStore.setState({ skills: [{ ...sampleSkill, enabled: false }] });
 const { toggleSkill } = useSkillStore.getState();

 toggleSkill('skill-1');

 expect(useSkillStore.getState().skills[0].enabled).toBe(true);
 });

 it('leaves other skills untouched', () => {
 const a = { ...sampleSkill, id: 'a' };
 const b = { ...sampleSkill, id: 'b' };
 useSkillStore.setState({ skills: [a, b] });
 const { toggleSkill } = useSkillStore.getState();

 toggleSkill('a');

 const skills = useSkillStore.getState().skills;
 expect(skills[0].enabled).toBe(false);
 expect(skills[1].enabled).toBe(true);
 });
 });

 describe('addExecution', () => {
 it('appends execution to list', () => {
 const { addExecution } = useSkillStore.getState();
 addExecution(sampleExecution);

 expect(useSkillStore.getState().executions).toHaveLength(1);
 expect(useSkillStore.getState().executions[0]).toEqual(sampleExecution);
 });
 });

 describe('updateExecution', () => {
 it('merges updates into matching execution', () => {
 useSkillStore.setState({ executions: [sampleExecution] });
 const { updateExecution } = useSkillStore.getState();

 const completedAt = new Date('2024-01-01T11:00:00Z');
 updateExecution('exec-1', { status: 'completed', completedAt });

 const updated = useSkillStore.getState().executions[0];
 expect(updated.status).toBe('completed');
 expect(updated.completedAt).toEqual(completedAt);
 expect(updated.skillId).toBe('skill-1');
 });
 });
});
