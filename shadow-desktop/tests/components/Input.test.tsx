import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input, Textarea, Select } from '../../src/components/ui/Input';

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
  it('renders textarea with label', () => {
    render(<Textarea label="Description" />);
    expect(screen.getByText(/description/i)).toBeInTheDocument();
  });

  it('handles onChange event', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} />);
    
    await user.type(screen.getByRole('textbox'), 'some text');
    expect(handleChange).toHaveBeenCalled();
  });

  it('displays error message when error prop is provided', () => {
    render(<Textarea error="Error message" />);
    expect(screen.getByText(/error message/i)).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('renders select with options', () => {
    const options = [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
    ];
    render(<Select options={options} />);
    
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/option 1/i)).toBeInTheDocument();
    expect(screen.getByText(/option 2/i)).toBeInTheDocument();
  });

  it('handles option selection', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const options = [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
    ];
    render(<Select onChange={handleChange} options={options} />);
    
    await user.selectOptions(screen.getByRole('combobox'), 'opt2');
    expect(handleChange).toHaveBeenCalled();
  });
});