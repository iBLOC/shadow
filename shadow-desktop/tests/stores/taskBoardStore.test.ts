import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    steps: [
      { order: 1, description: 'Step 1', agent_type: 'executor' },
      { order: 2, description: 'Step 2', agent_type: 'reviewer' },
    ],
    estimated_time: '30m',
    required_agents: ['executor', 'reviewer'],
  }),
}));

import { useTaskBoardStore } from '../../src/stores/taskBoardStore';
import type { Task, TaskBoardColumn, WorkflowPhase, PlanStep } from '../../src/types';

describe('TaskBoardStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskBoardStore.setState({
      columns: [
        { id: 'backlog', title: 'Backlog', order: 0 },
        { id: 'todo', title: 'To Do', order: 1 },
        { id: 'in-progress', title: 'In Progress', order: 2 },
        { id: 'review', title: 'Review', order: 3 },
        { id: 'done', title: 'Done', order: 4 },
      ],
      tasks: [],
      autoApprove: false,
    });
  });

  describe('initial state', () => {
    it('has default columns', () => {
      const state = useTaskBoardStore.getState();
      expect(state.columns).toHaveLength(5);
      expect(state.columns[0].id).toBe('backlog');
      expect(state.columns[4].id).toBe('done');
    });

    it('starts with empty tasks', () => {
      const state = useTaskBoardStore.getState();
      expect(state.tasks).toEqual([]);
    });

    it('has autoApprove disabled by default', () => {
      const state = useTaskBoardStore.getState();
      expect(state.autoApprove).toBe(false);
    });
  });

  describe('addColumn', () => {
    it('adds a new column', () => {
      const { addColumn } = useTaskBoardStore.getState();
      
      const column: TaskBoardColumn = {
        id: 'custom',
        title: 'Custom Column',
        order: 5,
      };
      
      addColumn(column);
      
      const state = useTaskBoardStore.getState();
      expect(state.columns).toHaveLength(6);
      expect(state.columns[5].id).toBe('custom');
    });
  });

  describe('removeColumn', () => {
    it('removes a column by id', () => {
      const { removeColumn } = useTaskBoardStore.getState();
      
      removeColumn('todo');
      
      const state = useTaskBoardStore.getState();
      expect(state.columns).toHaveLength(4);
      expect(state.columns.find(c => c.id === 'todo')).toBeUndefined();
    });
  });

  describe('updateColumn', () => {
    it('updates column fields', () => {
      const { updateColumn } = useTaskBoardStore.getState();
      
      updateColumn('backlog', { title: 'Updated Backlog' });
      
      const state = useTaskBoardStore.getState();
      expect(state.columns[0].title).toBe('Updated Backlog');
    });
  });

  describe('addTask', () => {
    it('adds a new task', () => {
      const { addTask } = useTaskBoardStore.getState();
      
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      addTask(task);
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe('task-1');
    });
  });

  describe('removeTask', () => {
    it('removes a task by id', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().removeTask('task-1');
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks).toHaveLength(0);
    });
  });

  describe('updateTask', () => {
    it('updates task fields', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Original Title',
        description: 'Original',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().updateTask('task-1', { title: 'Updated Title' });
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].title).toBe('Updated Title');
    });
  });

  describe('moveTask', () => {
    it('moves task to a new column', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().moveTask('task-1', 'in-progress', 0);
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].columnId).toBe('in-progress');
      expect(state.tasks[0].order).toBe(0);
    });
  });

  describe('getScheduledTasks', () => {
    it('returns only scheduled tasks', () => {
      const normalTask: Task = {
        id: 'task-1',
        title: 'Normal Task',
        description: 'Normal',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const scheduledTask: Task = {
        id: 'task-2',
        title: 'Scheduled Task',
        description: 'Scheduled',
        columnId: 'backlog',
        order: 1,
        priority: 'medium',
        type: 'scheduled',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(normalTask);
      useTaskBoardStore.getState().addTask(scheduledTask);
      
      const scheduledTasks = useTaskBoardStore.getState().getScheduledTasks();
      
      expect(scheduledTasks).toHaveLength(1);
      expect(scheduledTasks[0].id).toBe('task-2');
    });
  });

  describe('setAutoApprove', () => {
    it('enables auto approve', () => {
      useTaskBoardStore.getState().setAutoApprove(true);
      
      const state = useTaskBoardStore.getState();
      expect(state.autoApprove).toBe(true);
    });
  });

  describe('startPlanning', () => {
    it('sets task to planning phase', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      
      const plan = {
        steps: [
          { order: 1, description: 'Step 1', agentType: 'executor' as const },
          { order: 2, description: 'Step 2', agentType: 'reviewer' as const },
        ] as PlanStep[],
        estimatedTime: '30m',
        requiredAgents: ['executor', 'reviewer'],
      };
      
      useTaskBoardStore.getState().startPlanning('task-1', plan);
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].workflowPhase).toBe('planning');
      expect(state.tasks[0].plan).toBeDefined();
      expect(state.tasks[0].plan!.steps).toHaveLength(2);
      expect(state.tasks[0].approval).toBeDefined();
    });

    it('auto-approves task when autoApprove is enabled', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().setAutoApprove(true);
      
      const plan = {
        steps: [
          { order: 1, description: 'Step 1', agentType: 'executor' as const },
        ] as PlanStep[],
        estimatedTime: '10m',
        requiredAgents: ['executor'],
      };
      
      useTaskBoardStore.getState().startPlanning('task-1', plan);
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].approval?.autoApproved).toBe(true);
      expect(state.tasks[0].approval?.approvedAt).toBeDefined();
    });
  });

  describe('approveTask', () => {
    it('approves a task and moves to running', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        workflowPhase: 'planning',
        approval: { required: true, autoApproved: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().approveTask('task-1');
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].workflowPhase).toBe('running');
      expect(state.tasks[0].approval?.required).toBe(false);
      expect(state.tasks[0].approval?.approvedAt).toBeDefined();
    });
  });

  describe('rejectTask', () => {
    it('rejects a task and returns to backlog', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        workflowPhase: 'planning',
        approval: { required: true, autoApproved: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().rejectTask('task-1', 'Not enough context');
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].workflowPhase).toBe('backlog');
      expect(state.tasks[0].plan).toBeUndefined();
      expect(state.tasks[0].approval?.rejectReason).toBe('Not enough context');
    });
  });

  describe('advanceWorkflow', () => {
    it('advances task to specified phase', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'backlog',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        workflowPhase: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().advanceWorkflow('task-1', 'review');
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].workflowPhase).toBe('review');
    });

    it('sets completedAt when moving to done', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        columnId: 'in-progress',
        order: 0,
        priority: 'medium',
        type: 'normal',
        tags: [],
        workflowPhase: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useTaskBoardStore.getState().addTask(task);
      useTaskBoardStore.getState().advanceWorkflow('task-1', 'done');
      
      const state = useTaskBoardStore.getState();
      expect(state.tasks[0].workflowPhase).toBe('done');
      expect(state.tasks[0].completedAt).toBeDefined();
    });
  });

  describe('workflow phase values', () => {
    it('accepts all valid workflow phases', () => {
      const phases: WorkflowPhase[] = ['backlog', 'planning', 'running', 'review', 'done'];
      
      phases.forEach(phase => {
        const task: Task = {
          id: 'task-1',
          title: 'Test',
          description: 'Test',
          columnId: 'backlog',
          order: 0,
          priority: 'medium',
          type: 'normal',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        useTaskBoardStore.getState().addTask(task);
        useTaskBoardStore.getState().advanceWorkflow('task-1', phase);
        
        const state = useTaskBoardStore.getState();
        expect(state.tasks[0].workflowPhase).toBe(phase);
        
        useTaskBoardStore.setState({ tasks: [] });
      });
    });
  });
});