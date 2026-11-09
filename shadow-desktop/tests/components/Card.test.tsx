import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../src/components/ui';

describe('Card', () => {
  it('renders card with children', () => {
    render(<Card>Card Content</Card>);
    expect(screen.getByText(/card content/i)).toBeInTheDocument();
  });

  it('renders with variant prop', () => {
    const { container } = render(<Card variant="elevated">Content</Card>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with padding prop', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders outlined variant', () => {
    const { container } = render(<Card variant="outlined">Content</Card>);
    expect(container.firstChild).toHaveClass('border-2');
  });

  it('renders interactive variant', () => {
    const { container } = render(<Card variant="interactive">Content</Card>);
    expect(container.firstChild).toHaveClass('cursor-pointer');
  });

  it('applies hover class when hover prop is true', () => {
    const { container } = render(<Card hover>Content</Card>);
    expect(container.firstChild).toHaveClass('hover:shadow-md');
  });

  it('forwards additional props', () => {
    render(<Card data-testid="test-card">Content</Card>);
    expect(screen.getByTestId('test-card')).toBeInTheDocument();
  });
});

describe('CardHeader', () => {
  it('renders card header', () => {
    render(<CardHeader>Header Content</CardHeader>);
    expect(screen.getByText(/header content/i)).toBeInTheDocument();
  });
});

describe('CardTitle', () => {
  it('renders card title', () => {
    render(<CardTitle>Title Text</CardTitle>);
    expect(screen.getByText(/title text/i)).toBeInTheDocument();
  });
});

describe('CardDescription', () => {
  it('renders card description', () => {
    render(<CardDescription>Description Text</CardDescription>);
    expect(screen.getByText(/description text/i)).toBeInTheDocument();
  });
});

describe('CardContent', () => {
  it('renders card content', () => {
    render(<CardContent>Content Text</CardContent>);
    expect(screen.getByText(/content text/i)).toBeInTheDocument();
  });
});

describe('CardFooter', () => {
  it('renders card footer', () => {
    render(<CardFooter>Footer Text</CardFooter>);
    expect(screen.getByText(/footer text/i)).toBeInTheDocument();
  });
});
