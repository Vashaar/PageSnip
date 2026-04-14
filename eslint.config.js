import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'dist-installers/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['electron/**/*.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-alert': 'off'
    }
  }
];
