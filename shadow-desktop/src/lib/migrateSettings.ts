const MIGRATION_KEY = 'settings_migrated_to_store';

export async function migrateFromLocalStorage(): Promise<void> {
  const migrated = localStorage.getItem(MIGRATION_KEY);
  
  if (migrated) {
    return;
  }

  localStorage.setItem(MIGRATION_KEY, 'true');
}

export async function clearLocalStorageSettings(): Promise<void> {
  // ⚠️ **`cortex_url` / `cortex_api_key` 是旧设置 UI 真实用过的存储键**
  // ⇒ ⇒ **必须逐字保留**（改字面量 ⇒ 这一条就擦不掉了 ⇒ ⇒ 旧的
  // API key 会**留在磁盘上**）⇒ ⇒ 它们是**历史键名**，不是现役概念。
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
