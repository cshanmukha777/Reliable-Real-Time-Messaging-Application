import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/expo-env.d.ts',
    ],
  },
  { files: ['**/*.ts', '**/*.tsx'], extends: [tseslint.configs.recommended] },
);
