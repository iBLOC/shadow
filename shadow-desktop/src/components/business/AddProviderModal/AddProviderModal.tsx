import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../../ui';
import { ProviderForm } from '../ProviderForm';
import { adminHeaders } from '../../../lib/adminToken';
import type { AddProviderModalProps, ProviderFormData } from './types';

const API_BASE = 'http://localhost:60080';

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
  const [error, setError] = useState<string | null>(null);
  const [showAutoMatchDialog, setShowAutoMatchDialog] = useState(false);
  const [fetchedProviderId, setFetchedProviderId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultApiBase[formData.provider_type] && !formData.api_base) {
      setFormData(prev => ({
        ...prev,
        api_base: defaultApiBase[prev.provider_type] || '',
      }));
    }
  }, [formData.provider_type, defaultApiBase]);

  const handleAddProvider = async () => {
    if (!formData.name) return;

    setIsSubmitting(true);
    setError(null);
    try {
      if (onSave) {
        await onSave(formData);
      } else {
        const providerId = `${formData.provider_type}-${Date.now()}`;
        
        const response = await fetch(`${API_BASE}/models/providers`, {
          method: 'POST',
          // ⚠️ **必须带 `X-Admin-Token`** —— 「新增供应商」是**写路由**
          // （端脑的 providers 面：写路由在 admin 门后面，没配 token ⇒
          // fail-closed 401 ⇒ 这个按钮会直接失败，而且报的是「新增失败」，
          // 不会告诉用户「少了一把钥匙」）。
          // ⚠️ 展开写在**前**：凭据闸（`check-provider-admin-headers.mjs`）
          // 认的是「headers 的值里出现 adminHeaders()」⇒ 展开写在后面会被
          // 它的正则截断在第一个逗号处 ⇒ 认不出 ⇒ 误报成红。
          headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: providerId,
            name: formData.name,
            provider_type: formData.provider_type,
            api_base: formData.api_base || null,
            api_key: formData.api_key || null,
            models: [],
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to add provider: ${response.status} ${errorBody}`);
        }

        try {
          const fetchModelsResponse = await fetch(`${API_BASE}/models/providers/${providerId}/fetch-models`, {
            method: 'POST',
            // ⚠️ 同上：写路由 ⇒ 必须带 admin token。
            headers: await adminHeaders(),
          });
          if (fetchModelsResponse.ok) {
            const modelsData = await fetchModelsResponse.json();
            console.log(`Fetched ${modelsData.count} models from provider`);
            if (modelsData.count > 0) {
              setFetchedProviderId(providerId);
              setShowAutoMatchDialog(true);
              return;
            }
          }
        } catch (e) {
          console.warn('Failed to fetch models from provider:', e);
        }

        onSuccess?.();
      }

      resetForm();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add provider';
      console.error('Failed to add provider:', error);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoMatch = async (autoMatch: boolean) => {
    setShowAutoMatchDialog(false);
    
    if (autoMatch && fetchedProviderId) {
      try {
        const response = await fetch(`${API_BASE}/models/providers/${fetchedProviderId}/auto-match`, {
          method: 'POST',
          // ⚠️ 同上：写路由 ⇒ 必须带 admin token。
          headers: await adminHeaders(),
        });
        if (response.ok) {
          console.log('Auto-matched models to agents');
        }
      } catch (e) {
        console.warn('Failed to auto-match models:', e);
      }
    }
    
    setFetchedProviderId(null);
    onSuccess?.();
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      provider_type: providerTypes?.[0]?.id || 'openai',
      api_base: defaultApiBase[providerTypes?.[0]?.id || 'openai'] || '',
      api_key: '',
      enabled: true,
    });
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (showAutoMatchDialog) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={() => handleAutoMatch(false)}
        title={t('models.autoMatchTitle')}
        description={t('models.autoMatchDesc')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => handleAutoMatch(false)}>
              {t('models.skipAutoMatch')}
            </Button>
            <Button variant="primary" onClick={() => handleAutoMatch(true)}>
              {t('models.confirmAutoMatch')}
            </Button>
          </div>
        }
      >
        <div />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('models.addProvider')}
      description={t('models.addProviderDesc')}
      size="md"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
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
