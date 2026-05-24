import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../../src/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No Data" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No Data" description="There is nothing here" />);
    expect(screen.getByText(/there is nothing here/i)).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No Data" icon={<span data-testid="icon">📭</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders action button when action prop is provided', () => {
    render(
      <EmptyState
        title="No Data"
        action={{ label: 'Add Item', onClick: vi.fn() }}
      />
    );
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('calls onClick when action button is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <EmptyState
        title="No Data"
        action={{ label: 'Add Item', onClick: handleClick }}
      />
    );
    
    await user.click(screen.getByRole('button', { name: /add item/i }));
    expect(handleClick).toHaveBeenCalled();
  });

  it('renders small size', () => {
    const { container } = render(<EmptyState title="No Data" size="sm" />);
    expect(container.firstChild).toHaveClass(/sm/);
  });

  it('renders medium size by default', () => {
    const { container } = render(<EmptyState title="No Data" />);
    expect(container.firstChild).toHaveClass(/md/);
  });

  it('renders large size', () => {
    const { container } = render(<EmptyState title="No Data" size="lg" />);
    expect(container.firstChild).toHaveClass(/lg/);
  });

  it('renders glass style when glass prop is true', () => {
    const { container } = render(<EmptyState title="No Data" glass />);
    expect(container.firstChild).toHaveClass(/glass/);
  });
});