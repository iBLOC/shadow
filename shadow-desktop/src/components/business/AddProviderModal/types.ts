export interface ModelProvider {
  id: string;
  name: string;
  provider_type: string;
  api_base: string | null;
  api_key: string | null;
  enabled: boolean;
  models: LLMModel[];
  created_at: string;
  updated_at: string;
}

export interface LLMModel {
  id: string;
  provider_id: string;
  name: string;
  model_id: string;
  model_type: string;
  context_length: number | null;
  supports_vision: boolean;
  supports_function_calling: boolean;
  enabled: boolean;
  is_default: boolean;
}

export interface ProviderTypeOption {
  id: string;
  name: string;
  color: string;
}

export interface ProviderFormData {
  name: string;
  provider_type: string;
  api_base: string;
  api_key: string;
  enabled: boolean;
}

export interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (provider: ModelProvider) => void;
  onSave?: (data: ProviderFormData) => Promise<void>;
  providerTypes?: ProviderTypeOption[];
  defaultApiBase?: Record<string, string>;
}
