import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading, Skeleton, SkeletonCard } from '../../src/components/ui/Loading';

describe('Loading', () => {
  it('renders loading spinner', () => {
    render(<Loading />);
    expect(document.querySelector('svg.lucide-loader-circle')).toBeInTheDocument();
  });

  it('renders with text when provided', () => {
    render(<Loading text="Loading..." />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders small size', () => {
    render(<Loading size="sm" />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('height', '16');
  });

  it('renders medium size by default', () => {
    render(<Loading />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('renders large size', () => {
    render(<Loading size="lg" />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('renders fullscreen when fullScreen prop is true', () => {
    const { container } = render(<Loading fullScreen />);
    expect(container.firstChild).toHaveClass(/_fullScreen/);
  });
});

describe('Skeleton', () => {
  it('renders skeleton placeholder', () => {
    render(<Skeleton />);
    expect(document.querySelector('div[style]')).toBeInTheDocument();
  });

  it('renders with custom width', () => {
    render(<Skeleton width={100} />);
    const skeleton = document.querySelector('div[style]') as HTMLElement;
    expect(skeleton.style.width).toBe('100px');
  });

  it('renders with custom height', () => {
    render(<Skeleton height={50} />);
    const skeleton = document.querySelector('div[style]') as HTMLElement;
    expect(skeleton.style.height).toBe('50px');
  });

  it('renders with custom border radius', () => {
    render(<Skeleton borderRadius="lg" />);
    const skeleton = document.querySelector('div[style]') as HTMLElement;
    expect(skeleton.style.borderRadius).toBe('12px');
  });

  it('renders full border radius', () => {
    render(<Skeleton borderRadius="full" />);
    const skeleton = document.querySelector('div[style]') as HTMLElement;
    expect(skeleton.style.borderRadius).toBe('9999px');
  });
});

describe('SkeletonCard', () => {
  it('renders skeleton card', () => {
    render(<SkeletonCard />);
    const skeletonCard = document.querySelector('div[class*="skeletonCard"]');
    expect(skeletonCard).toBeInTheDocument();
  });
});