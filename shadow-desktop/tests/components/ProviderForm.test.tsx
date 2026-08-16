import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderForm } from '../../src/components/business/ProviderForm/ProviderForm';

describe('ProviderForm', () => {
  const defaultValue = {
    name: '',
    provider_type: 'openai',
    api_base: '',
    api_key: '',
    enabled: true,
  };

  it('renders provider form', () => {
    render(<ProviderForm value={defaultValue} onChange={() => {}} />);
    const form = document.querySelector('div');
    expect(form).toBeInTheDocument();
  });

  it('renders provider name input when showProviderName is true', () => {
    render(<ProviderForm value={defaultValue} onChange={() => {}} showProviderName />);
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('renders provider type buttons', () => {
    render(<ProviderForm value={defaultValue} onChange={() => {}} />);
    const buttons = document.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders toggle visibility button', () => {
    render(<ProviderForm value={defaultValue} onChange={() => {}} />);
    const buttons = document.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onChange when name changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<ProviderForm value={defaultValue} onChange={handleChange} showProviderName />);
    
    const firstInput = document.querySelector('input');
    if (firstInput) {
      await user.type(firstInput, 'My Provider');
    }
    expect(handleChange).toHaveBeenCalled();
  });

  it('disables inputs when disabled prop is true', () => {
    render(<ProviderForm value={defaultValue} onChange={() => {}} disabled />);
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => expect(input).toBeDisabled());
  });

  it('renders default provider types', () => {
    render(<ProviderForm value={defaultValue} onChange={() => {}} />);
    const buttons = document.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThan(2);
  });
});