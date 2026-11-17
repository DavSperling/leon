import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './src/test/test-env';

// Les tests qui mesurent un débit tournent seuls, après les autres tests en base : en parallèle, les autres fichiers
// prennent la base et les processeurs, et la mesure dépassait sa limite sur presque chaque CI de main (10,3 à
// 12,9 s pour 10, contre 4 s seul).
const DB_ALONE = ['src/server/search/worker.db.test.ts'];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: TEST_ENV,
    setupFiles: ['src/test/next-intl.ts'],
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
          exclude: [...DB_ALONE, '**/node_modules/**'],
          globalSetup: ['src/test/global-setup.ts'],
          testTimeout: 20_000,
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: 'db-seul',
          include: DB_ALONE,
          globalSetup: ['src/test/global-setup.ts'],
          testTimeout: 20_000,
          maxWorkers: 1,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
