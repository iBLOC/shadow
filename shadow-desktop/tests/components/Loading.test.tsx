import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading, Skeleton } from '../../src/components/ui';

describe('Loading', () => {
  it('renders loading spinner', () => {
    const { container } = render(<Loading />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('animate-spin');
  });

  it('renders with text when provided', () => {
    render(<Loading text="Loading..." />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders small size', () => {
    const { container } = render(<Loading size="sm" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders medium size by default', () => {
    const { container } = render(<Loading />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders large size', () => {
    const { container } = render(<Loading size="lg" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders fullscreen when fullScreen prop is true', () => {
    const { container } = render(<Loading fullScreen />);
    expect(container.firstChild).toHaveClass('fixed');
  });
});

describe('Skeleton', () => {
  it('renders skeleton placeholder', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('renders with custom width', () => {
    const { container } = render(<Skeleton style={{ width: 100 }} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.width).toBe('100px');
  });

  it('renders with custom height', () => {
    const { container } = render(<Skeleton style={{ height: 50 }} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.height).toBe('50px');
  });

  it('renders with custom border radius', () => {
    const { container } = render(<Skeleton style={{ borderRadius: '12px' }} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.borderRadius).toBe('12px');
  });

  it('renders full border radius', () => {
    const { container } = render(<Skeleton style={{ borderRadius: '9999px' }} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.borderRadius).toBe('9999px');
  });
});
