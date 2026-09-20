import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import minecraftLinting from 'eslint-plugin-minecraft-linting';

export default tseslint.config(
    {
        ignores: ['node_modules/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
            },
        },
        plugins: {
            'minecraft-linting': minecraftLinting,
        },
        rules: {
            'minecraft-linting/avoid-unnecessary-command': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    }
);
