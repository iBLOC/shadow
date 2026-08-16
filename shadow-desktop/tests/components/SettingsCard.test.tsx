import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsCard } from '../../src/components/business/SettingsCard/SettingsCard';

describe('SettingsCard', () => {
  it('renders settings card with title', () => {
    render(
      <SettingsCard title="General Settings">
        Content
      </SettingsCard>
    );
    expect(screen.getByText(/general settings/i)).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <SettingsCard
        title="General Settings"
        description="Configure your preferences"
      >
        Content
      </SettingsCard>
    );
    expect(screen.getByText(/configure your preferences/i)).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <SettingsCard title="Settings">
        <div>Settings Content</div>
      </SettingsCard>
    );
    expect(screen.getByText(/settings content/i)).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <SettingsCard
        title="Settings"
        icon={<span data-testid="icon">⚙️</span>}
      >
        Content
      </SettingsCard>
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <SettingsCard
        title="Settings"
        actions={<button>Save</button>}
      >
        Content
      </SettingsCard>
    );
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('renders glass variant when specified', () => {
    render(
      <SettingsCard
        title="Settings"
        variant="glass"
      >
        Content
      </SettingsCard>
    );
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });
});