import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../src/components/ui/Button';

describe('Button Component', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('button', 'primary', 'md');
  });

  it('renders different variants', () => {
    const { container: primary } = render(<Button variant="primary">Primary</Button>);
    const { container: secondary } = render(<Button variant="secondary">Secondary</Button>);
    const { container: danger } = render(<Button variant="danger">Danger</Button>);

    expect(primary.querySelector('button')).toHaveClass('primary');
    expect(secondary.querySelector('button')).toHaveClass('secondary');
    expect(danger.querySelector('button')).toHaveClass('danger');
  });

  it('renders different sizes', () => {
    const { container: sm } = render(<Button size="sm">Small</Button>);
    const { container: lg } = render(<Button size="lg">Large</Button>);

    expect(sm.querySelector('button')).toHaveClass('sm');
    expect(lg.querySelector('button')).toHaveClass('lg');
  });

  it('shows loading spinner when loading', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('loading');
    expect(button).toBeDisabled();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('handles click events', () => {
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(clicked).toBe(true);
  });

  it('does not click when disabled or loading', () => {
    let clickCount = 0;
    const handleClick = () => { clickCount++; };

    const { getByRole: getLoadingButton } = render(<Button loading onClick={handleClick}>Loading</Button>);
    const { getByRole: getDisabledButton } = render(<Button disabled onClick={handleClick}>Disabled</Button>);

    fireEvent.click(getLoadingButton({ name: /loading/i }));
    fireEvent.click(getDisabledButton({ name: /disabled/i }));

    expect(clickCount).toBe(0);
  });
});
