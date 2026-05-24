import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityCard } from '../../src/components/business/EntityCard/EntityCard';

describe('EntityCard', () => {
  it('renders entity card with header', () => {
    render(
      <EntityCard
        header={{
          title: 'Test Entity',
        }}
      />
    );
    expect(screen.getByText(/test entity/i)).toBeInTheDocument();
  });

  it('renders entity with subtitle', () => {
    render(
      <EntityCard
        header={{
          title: 'Test Entity',
          subtitle: 'Subtitle text',
        }}
      />
    );
    expect(screen.getByText(/subtitle text/i)).toBeInTheDocument();
  });

  it('renders entity with badge', () => {
    render(
      <EntityCard
        header={{
          title: 'Test Entity',
          badge: 'Active',
        }}
      />
    );
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('renders entity with badge variant', () => {
    render(
      <EntityCard
        header={{
          title: 'Test Entity',
          badge: 'Status',
          badgeVariant: 'success',
        }}
      />
    );
    expect(screen.getByText(/status/i)).toBeInTheDocument();
  });

  it('renders entity with icon', () => {
    render(
      <EntityCard
        header={{
          title: 'Test Entity',
          icon: <span data-testid="icon">🔧</span>,
        }}
      />
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('calls onClick when header is clickable', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        onClick={handleClick}
      />
    );
    
    await user.click(screen.getByText(/test entity/i));
    expect(handleClick).toHaveBeenCalled();
  });

  it('renders children when expanded', () => {
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        expanded={true}
      >
        <div>Expanded Content</div>
      </EntityCard>
    );
    expect(screen.getByText(/expanded content/i)).toBeInTheDocument();
  });

  it('hides children when not expanded', () => {
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        expanded={false}
      >
        <div>Expanded Content</div>
      </EntityCard>
    );
    expect(screen.queryByText(/expanded content/i)).not.toBeInTheDocument();
  });

  it('renders expand button when onExpand is provided', () => {
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        onExpand={() => {}}
      />
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('toggles expand on expand button click', async () => {
    const user = userEvent.setup();
    const handleExpand = vi.fn();
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        onExpand={handleExpand}
      />
    );
    
    await user.click(screen.getByRole('button'));
    expect(handleExpand).toHaveBeenCalled();
  });

  it('shows expanded arrow when expanded', () => {
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        expanded={true}
        onExpand={() => {}}
      />
    );
    expect(screen.getByText(/▼/)).toBeInTheDocument();
  });

  it('shows collapsed arrow when not expanded', () => {
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        expanded={false}
        onExpand={() => {}}
      />
    );
    expect(screen.getByText(/▶/)).toBeInTheDocument();
  });

  it('renders actions', () => {
    render(
      <EntityCard
        header={{ title: 'Test Entity' }}
        actions={<button>Action</button>}
      />
    );
    expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
  });
});