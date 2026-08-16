const MIGRATION_KEY = 'settings_migrated_to_store';

export async function migrateFromLocalStorage(): Promise<void> {
  const migrated = localStorage.getItem(MIGRATION_KEY);
  
  if (migrated) {
    return;
  }

  localStorage.setItem(MIGRATION_KEY, 'true');
}

export async function clearLocalStorageSettings(): Promise<void> {
  const keysToRemove = [
    'shadow_setup_complete',
    'theme',
    'language',
    'cortex_url',
    'cortex_api_key',
    'hf_token',
    'settings_migrated_to_store',
  ];

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
