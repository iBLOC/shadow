import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, StatusBadge, PriorityBadge } from '../../src/components/ui/Badge';

describe('Badge', () => {
  it('renders badge with children', () => {
    render(<Badge>Label</Badge>);
    expect(screen.getByText(/label/i)).toBeInTheDocument();
  });

  it('renders with default variant', () => {
    const { container } = render(<Badge>Label</Badge>);
    expect(container.firstChild).toHaveClass(/default/);
  });

  it('renders success variant', () => {
    const { container } = render(<Badge variant="success">Label</Badge>);
    expect(container.firstChild).toHaveClass(/success/);
  });

  it('renders warning variant', () => {
    const { container } = render(<Badge variant="warning">Label</Badge>);
    expect(container.firstChild).toHaveClass(/warning/);
  });

  it('renders danger variant', () => {
    const { container } = render(<Badge variant="danger">Label</Badge>);
    expect(container.firstChild).toHaveClass(/danger/);
  });

  it('renders info variant', () => {
    const { container } = render(<Badge variant="info">Label</Badge>);
    expect(container.firstChild).toHaveClass(/info/);
  });

  it('renders accent variant', () => {
    const { container } = render(<Badge variant="accent">Label</Badge>);
    expect(container.firstChild).toHaveClass(/accent/);
  });

  it('renders small size', () => {
    const { container } = render(<Badge size="sm">Label</Badge>);
    expect(container.firstChild).toHaveClass(/sm/);
  });

  it('renders medium size by default', () => {
    const { container } = render(<Badge>Label</Badge>);
    expect(container.firstChild).toHaveClass(/md/);
  });

  it('renders dot indicator when dot prop is true', () => {
    const { container } = render(<Badge dot>Label</Badge>);
    expect(container.firstChild).toHaveClass(/dot/);
  });

  it('renders pulse animation when pulse prop is true', () => {
    const { container } = render(<Badge pulse>Label</Badge>);
    expect(container.firstChild).toHaveClass(/pulse/);
  });
});

describe('StatusBadge', () => {
  it('renders online status', () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it('renders offline status', () => {
    render(<StatusBadge status="offline" />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('renders connecting status', () => {
    render(<StatusBadge status="connecting" />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('renders error status', () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it('renders running status', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  it('renders stopped status', () => {
    render(<StatusBadge status="stopped" />);
    expect(screen.getByText(/stopped/i)).toBeInTheDocument();
  });

  it('renders busy status', () => {
    render(<StatusBadge status="busy" />);
    expect(screen.getByText(/busy/i)).toBeInTheDocument();
  });
});

describe('PriorityBadge', () => {
  it('renders urgent priority', () => {
    render(<PriorityBadge priority="urgent" />);
    expect(screen.getByText(/urgent/i)).toBeInTheDocument();
  });

  it('renders high priority', () => {
    render(<PriorityBadge priority="high" />);
    expect(screen.getByText(/high/i)).toBeInTheDocument();
  });

  it('renders medium priority', () => {
    render(<PriorityBadge priority="medium" />);
    expect(screen.getByText(/medium/i)).toBeInTheDocument();
  });

  it('renders low priority', () => {
    render(<PriorityBadge priority="low" />);
    expect(screen.getByText(/low/i)).toBeInTheDocument();
  });
});