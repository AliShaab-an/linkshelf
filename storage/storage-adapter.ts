export interface StorageAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export class ChromeStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<unknown> {
    const result = await browser.storage.local.get(key);

    return result[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  }
}
