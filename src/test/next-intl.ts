import { createTranslator } from 'next-intl';
import { vi } from 'vitest';
import fr from '../../messages/fr.json';

// Hors de Next, `next-intl/server` se résout vers sa version client, où getTranslations lève. Les tests lisent les
// messages français, comme une requête sans cookie de langue.
vi.mock('next-intl/server', () => ({
  getRequestConfig: (config: unknown) => config,
  getLocale: async () => 'fr',
  getMessages: async () => fr,
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: 'fr', messages: fr, namespace: namespace as never }),
}));
