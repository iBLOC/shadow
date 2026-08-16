import type { ProviderTypeOption, ProviderFormData } from '../AddProviderModal/types';

export interface ProviderFormProps {
  value: ProviderFormData;
  onChange: (value: ProviderFormData) => void;
  providerTypes?: ProviderTypeOption[];
  defaultApiBase?: Record<string, string>;
  showProviderName?: boolean;
  disabled?: boolean;
}

export type { ProviderFormData, ProviderTypeOption } from '../AddProviderModal/types';
