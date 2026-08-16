const cache = new Map<string, unknown>();

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  if (cache.has(key)) {
    return cache.get(key) as T;
  }

  const value = localStorage.getItem(key);
  if (value !== null) {
    try {
      const parsed = JSON.parse(value) as T;
      cache.set(key, parsed);
      return parsed;
    } catch {
      cache.set(key, value as T);
      return value as T;
    }
  }

  return defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  cache.set(key, value);
  localStorage.setItem(key, JSON.stringify(value));
}

export async function deleteSetting(key: string): Promise<void> {
  cache.delete(key);
  localStorage.removeItem(key);
}

export async function clearSettings(): Promise<void> {
  cache.clear();
  localStorage.clear();
}
