export default [
  { ignores: ['vendor/**', 'build/**', 'dist/**', 'node_modules/**', '.pnpm-store/**'] },
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: Object.fromEntries(['browser', 'angular', 'window', 'document', 'navigator', 'location', 'localStorage', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'URL', 'Blob', 'fetch', 'crypto', 'AbortController', 'structuredClone', 'process', 'Buffer'].map(v => [v, 'readonly'])) },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], 'no-unreachable': 'error', 'no-constant-condition': 'error', 'no-eval': 'error', 'no-implied-eval': 'error', 'eqeqeq': 'error' } },
];
