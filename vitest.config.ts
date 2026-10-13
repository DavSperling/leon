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
        },
      },
    ],
  },
});
