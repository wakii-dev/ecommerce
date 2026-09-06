// ESLint flat preset dùng chung — app/package dùng:
//   import preset from '@ecommerce/config/eslint';
//   export default [...preset, { /* rules riêng */ }];
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'src/generated/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  }
);
