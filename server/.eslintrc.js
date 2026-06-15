module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: { node: true },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    // Enforce the DAL invariant: only *.repository.ts files may import supabase-js.
    // This is what keeps "swap the DB later" real — services/controllers must depend
    // on repository interfaces, never on the Supabase client directly.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@supabase/supabase-js',
            message:
              'Only *.repository.ts files may import @supabase/supabase-js. ' +
              'Services and controllers must depend on repository interfaces.',
          },
        ],
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Repository files are the only layer allowed to touch supabase-js directly.
      files: ['**/*.repository.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      // Test files: relax unused-vars for mock setup parameters.
      files: ['**/*.spec.ts'],
      rules: { '@typescript-eslint/no-unused-vars': 'warn' },
    },
  ],
};
