import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'spikes/**', 'docs/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['apps/**/*.{ts,tsx,mts,cts,mjs,cjs}', 'packages/**/*.{ts,tsx,mts,cts,mjs,cjs}', 'tests/**/*.{ts,tsx,mts,cts,mjs,cjs}'],
    languageOptions: {
      parserOptions: {
        projectService: {
          // These five JavaScript evidence helpers are outside the TS project;
          // their five .d.mts contracts are already imported by r43-helper-types.ts.
          allowDefaultProject: [
            'packages/database/test/otp-migration-evidence.mjs',
            'packages/database/test/r17-migration-evidence.mjs',
            'packages/database/test/r19-target-ledger.mjs',
            'packages/database/test/reconsent-diagnostic.mjs',
            'packages/database/test/reconsent-native-fixture.mjs'
          ],
          defaultProject: 'packages/database/test/tsconfig.json'
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  },
  {
    files: ['packages/database/test/reconsent-native-fixture.mjs'],
    languageOptions: { globals: { Buffer: 'readonly' } }
  },
  {
    files: ['packages/database/test/otp-migration-evidence.mjs'],
    languageOptions: { globals: { process: 'readonly' } }
  },
  {
    files: ['packages/database/test/r17-migration-evidence.mjs'],
    languageOptions: { globals: { process: 'readonly' } }
  },
  {
    files: ['packages/database/test/r19-target-ledger.mjs'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly' } }
  },
  {
    files: ['packages/database/test/reconsent-diagnostic.mjs'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', structuredClone: 'readonly' } }
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off'
    }
  }
);
