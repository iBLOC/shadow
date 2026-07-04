import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../../ui';
import { ProviderForm } from '../ProviderForm';
import type { AddProviderModalProps, ModelProvider, ProviderFormData } from './types';

const API_BASE = 'http://localhost:8082';

export function AddProviderModal({
  isOpen,
  onClose,
  onSuccess,
  onSave,
  providerTypes,
  defaultApiBase = {},
}: AddProviderModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    provider_type: providerTypes?.[0]?.id || 'openai',
    api_base: defaultApiBase[providerTypes?.[0]?.id || 'openai'] || '',
    api_key: '',
    enabled: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddProvider = async () => {
    if (!formData.name) return;

    setIsSubmitting(true);
    try {
      if (onSave) {
        await onSave(formData);
      } else {
        const response = await fetch(`${API_BASE}/models/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!response.ok) throw new Error('Failed to add provider');

        const provider: ModelProvider = await response.json();
        onSuccess?.(provider);
      }

      resetForm();
      onClose();
    } catch (error) {
      console.error('Failed to add provider:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      provider_type: providerTypes?.[0]?.id || 'openai',
      api_base: defaultApiBase[providerTypes?.[0]?.id || 'openai'] || '',
      api_key: '',
      enabled: true,
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('models.addProvider')}
      description={t('models.addProviderDesc')}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleAddProvider}
            loading={isSubmitting}
            disabled={!formData.name || !formData.api_base}
          >
            {t('common.add')}
          </Button>
        </div>
      }
    >
      <ProviderForm
        value={formData}
        onChange={setFormData}
        providerTypes={providerTypes}
      />
    </Modal>
  );
}

export { type ModelProvider, type LLMModel, type AddProviderModalProps, type ProviderFormData } from './types';
