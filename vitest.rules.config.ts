// Tests des règles Firestore : exigent l'émulateur (FIRESTORE_EMULATOR_HOST), donc hors de `npm test`.
// Lancement : npm run test:rules:emulator (firebase-tools emulators:exec, projet demo-mobilis, Java 21).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rules',
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
