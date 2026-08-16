declare module '@tauri-apps/plugin-store' {
  export class Store {
    static load(path: string): Promise<Store>;
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    save(): Promise<void>;
  }
}
