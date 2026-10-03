import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'scripts/**', '*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      // Nest injects by constructor type; type-only imports would erase the token.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
