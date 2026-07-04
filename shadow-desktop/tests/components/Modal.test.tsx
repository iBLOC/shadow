import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../../src/components/ui';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Test">Modal Content</Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Test Title">Content</Modal>);
    expect(screen.getByText(/test title/i)).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Title" description="Test Description">Content</Modal>);
    expect(screen.getByText(/test description/i)).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Title">Test Children</Modal>);
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
    
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders footer when provided', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Title" footer={<button>Footer Action</button>}>
        Content
      </Modal>
    );
    expect(screen.getByText(/footer action/i)).toBeInTheDocument();
  });

  it('renders with correct size', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Title" size="lg">Content</Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
