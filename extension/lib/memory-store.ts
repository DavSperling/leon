import type { KeyValueStore } from './settings';

// Magasin en mémoire pour les tests (le vrai est browser.storage.local, voir browser-store.ts).
export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      data.set(key, value);
    },
  };
}
