import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@src': path.join(ROOT, 'src') } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'legacy',
          include: ['tests/legacy.test.ts', 'tests/**/*.spec.ts'],
          environment: 'node',
          testTimeout: 180_000,
          maxConcurrency: 6,
        },
      },
    ],
  },
});
