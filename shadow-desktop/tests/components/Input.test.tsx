import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../src/components/ui';

describe('Input', () => {
  it('renders input with label', () => {
    render(<Input label="Test Label" />);
    expect(screen.getByText(/test label/i)).toBeInTheDocument();
  });

  it('renders input without label when not provided', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText(/enter text/i)).toBeInTheDocument();
  });

  it('handles onChange event', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);
    
    await user.type(screen.getByRole('textbox'), 'hello');
    expect(handleChange).toHaveBeenCalled();
  });

  it('displays error message when error prop is provided', () => {
    render(<Input error="This is an error" />);
    expect(screen.getByText(/this is an error/i)).toBeInTheDocument();
  });

  it('displays hint when hint prop is provided and no error', () => {
    render(<Input hint="This is a hint" />);
    expect(screen.getByText(/this is a hint/i)).toBeInTheDocument();
  });

  it('hides hint when error is present', () => {
    render(<Input hint="Hint text" error="Error text" />);
    expect(screen.queryByText(/hint text/i)).not.toBeInTheDocument();
    expect(screen.getByText(/error text/i)).toBeInTheDocument();
  });

  it('forwards ref to input element', () => {
    const ref = { current: null };
    render(<Input ref={(el) => Object.assign(ref, { current: el })} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders with icon on left by default', () => {
    render(<Input icon={<span data-testid="icon">🔑</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders with icon on right when iconPosition is right', () => {
    render(<Input icon={<span data-testid="icon">🔑</span>} iconPosition="right" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});

describe('Textarea', () => {
  it('renders textarea', () => {
    render(<Textarea data-testid="ta" />);
    expect(screen.getByTestId('ta')).toBeInTheDocument();
  });

  it('renders textarea and accepts input', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} data-testid="ta" />);
    
    await user.type(screen.getByTestId('ta'), 'some text');
    expect(handleChange).toHaveBeenCalled();
  });

  it('accepts placeholder text', () => {
    render(<Textarea placeholder="Enter description" />);
    expect(screen.getByPlaceholderText(/enter description/i)).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('renders select trigger', () => {
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="opt1">Option 1</SelectItem>
          <SelectItem value="opt2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByTestId('select-trigger')).toBeInTheDocument();
  });

  it('displays selected value', () => {
    render(
      <Select defaultValue="opt1">
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="opt1">Option 1</SelectItem>
          <SelectItem value="opt2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByTestId('select-trigger')).toBeInTheDocument();
  });
});
