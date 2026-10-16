module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.base.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json', './simulator/*/tsconfig.json'],
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  ignorePatterns: ['node_modules', 'dist', '.next', 'build', 'coverage', '**/*.d.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['*.config.js', '*.config.cjs', 'eslint.config.*'],
      env: { node: true },
      rules: { '@typescript-eslint/no-var-requires': 'off' },
    },
  ],
};
