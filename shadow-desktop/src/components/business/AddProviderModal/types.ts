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
  /**
   * **能力标注**（llm / asr / tts / embedding / vision / rerank / …）。
   *
   * ⚠️ 这个字段**运行时就在**（大脑目录给的那份），但类型里原来没声明
   * ⇒ ⇒ 谁读它都得先 cast ⇒ ⇒ 「分档默认模型」那张卡只能靠猜。
   * ⚠️ 两种形状都可能有：**单个** `capability`（目录那份）与
   * **数组** `capabilities`（大脑自己那份）⇒ ⇒ 两个都留着。
   */
  capability?: string;
  capabilities?: string[];
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
  onSuccess?: (provider?: ModelProvider) => void;
  onSave?: (data: ProviderFormData) => Promise<void>;
  providerTypes?: ProviderTypeOption[];
  defaultApiBase?: Record<string, string>;
}
