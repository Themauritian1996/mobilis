// ESLint (flat config). Strict sur le nouveau code TypeScript (src/, tests/*.ts) ; filet de sécurité minimal sur le
// legacy (www/js) pour ne pas bloquer la migration : seules les erreurs réelles (variables non définies, code
// inatteignable…) y sont des erreurs. Les règles de couches et de cycles sont dans .dependency-cruiser.cjs.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      'dist/**',
      'android/**',
      'node_modules/**',
      'coverage/**',
      'www/vendor/**',
      'www/js/lang/**',
      'functions/**',
      'docs/gait-literature/**',
    ],
  },

  // ---------------------------------------------------------------- Nouveau code (TypeScript strict)
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, ...tseslint.configs.stylistic, prettier],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['firebase', 'firebase/*', '@firebase/*'],
              message: 'Firebase : uniquement dans src/services/*/firebase/.',
            },
          ],
        },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/services/*/firebase/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/**/*.test.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // ---------------------------------------------------------------- Legacy (www/js) : filet de sécurité
  {
    files: ['www/js/**/*.js', 'www/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, jspdf: 'readonly', Capacitor: 'readonly' },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-cond-assign': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
      'no-async-promise-executor': 'off',
      'no-fallthrough': 'off',
      'no-case-declarations': 'off',
      'no-misleading-character-class': 'off',
      'no-sparse-arrays': 'off',
      'no-unused-private-class-members': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      // reportpdf.js : clé U+2009 en double (même valeur, sans effet) — à corriger à la migration (docs/MIGRATION.md).
      'no-dupe-keys': 'warn',
    },
  },

  // ---------------------------------------------------------------- Scripts Node et tests v1.15
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.mjs', '*.config.{js,cjs}', '.dependency-cruiser.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    // Les tests e2e contiennent du code exécuté dans la page (page.evaluate).
    files: ['tests/**/*.e2e.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
);
