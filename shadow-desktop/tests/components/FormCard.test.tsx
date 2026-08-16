import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormCard, FormGroup, FormRow } from '../../src/components/business/FormCard/FormCard';

describe('FormCard', () => {
  describe('rendering', () => {
    it('renders title', () => {
      render(<FormCard title="My Form"><div>content</div></FormCard>);
      expect(screen.getByText(/my form/i)).toBeInTheDocument();
    });

    it('renders children content', () => {
      render(
        <FormCard title="My Form">
          <div>form body content</div>
        </FormCard>,
      );
      expect(screen.getByText(/form body content/i)).toBeInTheDocument();
    });

    it('uses default submit label "Save"', () => {
      const onSubmit = vi.fn();
      render(
        <FormCard title="Form" onSubmit={onSubmit}>
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('uses default cancel label "Cancel"', () => {
      const onCancel = vi.fn();
      render(
        <FormCard title="Form" onCancel={onCancel}>
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('uses custom submit label', () => {
      const onSubmit = vi.fn();
      render(
        <FormCard title="Form" onSubmit={onSubmit} submitLabel="Create Agent">
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument();
    });

    it('uses custom cancel label', () => {
      const onCancel = vi.fn();
      render(
        <FormCard title="Form" onCancel={onCancel} cancelLabel="Discard">
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
    });
  });

  describe('button visibility', () => {
    it('hides actions section when neither onCancel nor onSubmit provided', () => {
      render(
        <FormCard title="Form">
          <div>x</div>
        </FormCard>,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows only submit button when onSubmit provided without onCancel', () => {
      render(
        <FormCard title="Form" onSubmit={vi.fn()}>
          <div>x</div>
        </FormCard>,
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent(/save/i);
    });

    it('shows only cancel button when onCancel provided without onSubmit', () => {
      render(
        <FormCard title="Form" onCancel={vi.fn()}>
          <div>x</div>
        </FormCard>,
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent(/cancel/i);
    });

    it('shows both buttons when onSubmit and onCancel both provided', () => {
      render(
        <FormCard title="Form" onSubmit={vi.fn()} onCancel={vi.fn()}>
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onSubmit when submit button clicked', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <FormCard title="Form" onSubmit={onSubmit}>
          <div>x</div>
        </FormCard>,
      );
      await user.click(screen.getByRole('button', { name: /save/i }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(
        <FormCard title="Form" onCancel={onCancel}>
          <div>x</div>
        </FormCard>,
      );
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('submitting state', () => {
    it('disables cancel button when isSubmitting=true', () => {
      render(
        <FormCard title="Form" onSubmit={vi.fn()} onCancel={vi.fn()} isSubmitting>
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('disables submit button when disabled=true', () => {
      render(
        <FormCard title="Form" onSubmit={vi.fn()} disabled>
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('disables submit button when isSubmitting=true (via Button loading prop)', () => {
      render(
        <FormCard title="Form" onSubmit={vi.fn()} isSubmitting>
          <div>x</div>
        </FormCard>,
      );
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });
  });
});

describe('FormGroup', () => {
  it('renders children', () => {
    render(
      <FormGroup>
        <input aria-label="my-input" />
      </FormGroup>,
    );
    expect(screen.getByLabelText(/my-input/i)).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(
      <FormGroup label="Username">
        <input />
      </FormGroup>,
    );
    expect(screen.getByText(/username/i)).toBeInTheDocument();
  });

  it('does not render label element when label is not provided', () => {
    const { container } = render(
      <FormGroup>
        <input />
      </FormGroup>,
    );
    expect(container.querySelector('label')).toBeNull();
  });
});

describe('FormRow', () => {
  it('renders children', () => {
    render(
      <FormRow>
        <span>row content</span>
      </FormRow>,
    );
    expect(screen.getByText(/row content/i)).toBeInTheDocument();
  });
});
