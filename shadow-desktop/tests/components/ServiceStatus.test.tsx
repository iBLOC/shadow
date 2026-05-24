import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceStatus } from '../../src/components/business/ServiceStatus/ServiceStatus';

describe('ServiceStatus', () => {
  it('renders service name', () => {
    render(
      <ServiceStatus
        name="Prefrontal"
        status="connected"
      />
    );
    expect(screen.getByText(/prefrontal/i)).toBeInTheDocument();
  });

  it('renders Connected status', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="connected"
      />
    );
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it('renders Disconnected status', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="disconnected"
      />
    );
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });

  it('renders status badge for connecting', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="connecting"
      />
    );
    expect(screen.getAllByText(/connecting/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders Error status', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="error"
      />
    );
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it('renders message when provided', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="error"
        message="Connection failed"
      />
    );
    expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
  });

  it('calls onConnect when connect button is clicked', async () => {
    const user = userEvent.setup();
    const handleConnect = vi.fn();
    render(
      <ServiceStatus
        name="Test Service"
        status="disconnected"
        onConnect={handleConnect}
      />
    );
    
    await user.click(screen.getByRole('button', { name: /connect/i }));
    expect(handleConnect).toHaveBeenCalled();
  });

  it('calls onDisconnect when disconnect button is clicked', async () => {
    const user = userEvent.setup();
    const handleDisconnect = vi.fn();
    render(
      <ServiceStatus
        name="Test Service"
        status="connected"
        onDisconnect={handleDisconnect}
      />
    );
    
    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(handleDisconnect).toHaveBeenCalled();
  });

  it('shows connecting spinner', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="connecting"
        onConnect={() => {}}
      />
    );
    expect(document.querySelector('.lucide-loader-circle')).toBeInTheDocument();
  });

  it('disables connect button when status is connecting', () => {
    render(
      <ServiceStatus
        name="Test Service"
        status="connecting"
        onConnect={() => {}}
      />
    );
    const button = document.querySelector('button');
    expect(button).toBeDisabled();
  });
});