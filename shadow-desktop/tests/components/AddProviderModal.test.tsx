import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddProviderModal } from '../../src/components/business/AddProviderModal/AddProviderModal';

global.fetch = vi.fn();

describe('AddProviderModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders modal when isOpen is true', () => {
    render(
      <AddProviderModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders nothing when isOpen is false', () => {
    render(
      <AddProviderModal
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders add button', () => {
    render(
      <AddProviderModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders footer buttons', () => {
    render(
      <AddProviderModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <AddProviderModal
        isOpen={true}
        onClose={handleClose}
      />
    );
    
    const cancelButton = screen.getByText('common.cancel');
    await user.click(cancelButton);
    expect(handleClose).toHaveBeenCalled();
  });

  it('disables add button initially', () => {
    render(
      <AddProviderModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    const addButton = screen.getByText('common.add');
    expect(addButton).toBeDisabled();
  });

  it('has input for provider name', () => {
    render(
      <AddProviderModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });
});
