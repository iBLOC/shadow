import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;

export async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('settings.json');
  }
  return store;
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const s = await getStore();
    const value = await s.get<T>(key);
    return value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const s = await getStore();
  await s.set(key, value);
}

export async function deleteSetting(key: string): Promise<void> {
  const s = await getStore();
  await s.delete(key);
}

export async function clearSettings(): Promise<void> {
  const s = await getStore();
  await s.clear();
}
