import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCard } from '../../src/components/business/AgentCard/AgentCard';

describe('AgentCard', () => {
  const mockAgent = {
    id: 'agent-1',
    name: 'Test Agent',
    role: 'planner',
    category: 'built-in' as const,
    description: 'A test agent description',
    status: 'online' as const,
    capabilities: ['planning', 'reasoning'],
    endpoint: 'http://localhost:3000',
  };

  const mockExternalAgent = {
    id: 'agent-external',
    name: 'External Agent',
    externalType: 'opencode',
    category: 'external' as const,
    description: 'An external agent',
    status: 'online' as const,
    capabilities: ['coding'],
    endpoint: 'http://localhost:4000',
  };

  it('renders agent name in heading', () => {
    render(<AgentCard agent={mockAgent} />);
    expect(screen.getByRole('heading', { name: /test agent/i })).toBeInTheDocument();
  });

  it('renders agent description when provided', () => {
    render(<AgentCard agent={mockAgent} />);
    expect(screen.getByText(/a test agent description/i)).toBeInTheDocument();
  });

  it('renders endpoint when provided', () => {
    render(<AgentCard agent={mockAgent} />);
    expect(screen.getByText(/http:\/\/localhost:3000/i)).toBeInTheDocument();
  });

  it('renders capabilities when provided', () => {
    render(<AgentCard agent={mockAgent} />);
    expect(screen.getByText(/planning/i)).toBeInTheDocument();
    expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
  });

  it('shows more indicator when more than 3 capabilities', () => {
    const agentWithManyCaps = {
      ...mockAgent,
      capabilities: ['cap1', 'cap2', 'cap3', 'cap4', 'cap5'],
    };
    render(<AgentCard agent={agentWithManyCaps} />);
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const handleEdit = vi.fn();
    render(<AgentCard agent={mockAgent} onEdit={handleEdit} />);
    
    const buttons = await screen.findAllByRole('button');
    await buttons[1].click();
    expect(handleEdit).toHaveBeenCalledWith(mockAgent);
  });

  it('calls onDelete when delete button is clicked', async () => {
    const handleDelete = vi.fn();
    render(<AgentCard agent={mockAgent} onDelete={handleDelete} />);
    
    const buttons = await screen.findAllByRole('button');
    await buttons[2].click();
    expect(handleDelete).toHaveBeenCalledWith('agent-1');
  });

  it('calls onInvoke when start/stop button is clicked', async () => {
    const handleInvoke = vi.fn();
    render(<AgentCard agent={mockAgent} onInvoke={handleInvoke} />);
    
    const buttons = await screen.findAllByRole('button');
    await buttons[0].click();
    expect(handleInvoke).toHaveBeenCalledWith(mockAgent);
  });

  it('shows stop button when agent is online', () => {
    render(<AgentCard agent={mockAgent} />);
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('shows start button when agent is not online', () => {
    const offlineAgent = { ...mockAgent, status: 'offline' as const };
    render(<AgentCard agent={offlineAgent} />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('renders external agent name', () => {
    render(<AgentCard agent={mockExternalAgent} />);
    expect(screen.getByRole('heading', { name: /external agent/i })).toBeInTheDocument();
  });
});