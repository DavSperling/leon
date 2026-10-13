import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './src/test/test-env';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: TEST_ENV,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'extension/**/*.test.ts'],
          exclude: ['**/*.db.test.ts', '**/node_modules/**'],
          // Un groupe par projet : Vitest refuse deux maxWorkers différents dans un même groupe.
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['src/test/global-setup.ts'],
          testTimeout: 20_000,
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
