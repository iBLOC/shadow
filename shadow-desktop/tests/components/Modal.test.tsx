import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ConfirmModal } from '../../src/components/ui/Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false}>Content</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal when isOpen is true', () => {
    render(<Modal isOpen={true}>Modal Content</Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Modal isOpen={true} title="Test Title">Content</Modal>);
    expect(screen.getByText(/test title/i)).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<Modal isOpen={true} title="Title" description="Test Description">Content</Modal>);
    expect(screen.getByText(/test description/i)).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Modal isOpen={true}>Test Children</Modal>);
    expect(screen.getByText(/test children/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Title">
        Content
      </Modal>
    );
    
    await user.click(screen.getByLabelText(/close/i));
    expect(handleClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose}>
        Content
      </Modal>
    );
    
    const overlay = screen.getByText(/content/i).parentElement?.parentElement;
    if (overlay) {
      await user.click(overlay);
    }
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders footer when provided', () => {
    render(
      <Modal isOpen={true} footer={<button>Footer Action</button>}>
        Content
      </Modal>
    );
    expect(screen.getByText(/footer action/i)).toBeInTheDocument();
  });

  it('does not render close button when showClose is false', () => {
    render(<Modal isOpen={true} showClose={false}>Content</Modal>);
    expect(screen.queryByLabelText(/close/i)).not.toBeInTheDocument();
  });

  it('applies correct size class', () => {
    render(<Modal isOpen={true} size="lg">Content</Modal>);
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveClass(/lg/);
  });
});

describe('ConfirmModal', () => {
  it('renders confirm modal with title and message', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Confirm Title"
        message="Are you sure?"
      />
    );
    
    expect(screen.getByText(/confirm title/i)).toBeInTheDocument();
    expect(screen.getByText(/are you sure?/i)).toBeInTheDocument();
  });

  it('renders default confirm and cancel buttons', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Title"
        message="Message"
      />
    );
    
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
  });

  it('renders custom confirm and cancel text', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Title"
        message="Message"
        confirmText="Yes"
        cancelText="No"
      />
    );
    
    expect(screen.getByRole('button', { name: /^yes$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^no$/i })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={handleConfirm}
        title="Title"
        message="Message"
      />
    );
    
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(handleConfirm).toHaveBeenCalled();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={() => {}}
        title="Title"
        message="Message"
      />
    );
    
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalled();
  });

  it('shows loading state when loading prop is true', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Title"
        message="Message"
        loading={true}
      />
    );
    
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('applies danger variant', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Title"
        message="Message"
        variant="danger"
      />
    );
    
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    expect(confirmBtn).toHaveClass(/danger/);
  });
});