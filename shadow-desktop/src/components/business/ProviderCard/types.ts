import type { ModelProvider } from '../AddProviderModal/types';

export interface ProviderCardProps {
  provider: ModelProvider;
  onEdit?: (provider: ModelProvider) => void;
  onDelete?: (id: string) => void;
  onTest?: (id: string) => void;
}
