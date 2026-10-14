import { browser } from '#imports';
import type { KeyValueStore } from './settings';

// browser.storage.local, lisible depuis le service worker, le monde isolé et les pages.
export const browserStore: KeyValueStore = {
  async get(key) {
    return (await browser.storage.local.get(key))[key];
  },
  set(key, value) {
    return browser.storage.local.set({ [key]: value });
  },
};
