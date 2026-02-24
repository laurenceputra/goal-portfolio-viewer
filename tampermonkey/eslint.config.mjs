// ESLint flat config (ESM)
import js from '@eslint/js';

const baseRules = {
    'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
    }],
    'no-inner-declarations': 'off'
};

export default [
    {
        ignores: ['node_modules/**', 'coverage/**']
    },
    js.configs.recommended,
    {
        files: ['goal_portfolio_viewer.user.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                MutationObserver: 'readonly',
                HTMLElement: 'readonly',
                Node: 'readonly',
                console: 'readonly',
                URL: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                alert: 'readonly',
                history: 'readonly',
                CustomEvent: 'readonly',
                requestAnimationFrame: 'readonly',
                ResizeObserver: 'readonly',
                GM_setValue: 'readonly',
                GM_getValue: 'readonly',
                GM_deleteValue: 'readonly',
                GM_listValues: 'readonly',
                GM_cookie: 'readonly',
                GM_xmlhttpRequest: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                fetch: 'readonly',
                Headers: 'readonly',
                AbortController: 'readonly',
                XMLHttpRequest: 'readonly',
                module: 'readonly',
                require: 'readonly',
                confirm: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: baseRules
    },
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                process: 'readonly',
                console: 'readonly'
            }
        },
        rules: baseRules
    },
    {
        files: ['__tests__/**/*.js', '__tests__/**/*.cjs', '__tests__/**/*.mjs', '__tests__/**/*.jsx', '__tests__/**/*.ts', '__tests__/**/*.tsx'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                Buffer: 'readonly',
                jest: 'readonly',
                describe: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                it: 'readonly',
                global: 'readonly',
                window: 'readonly',
                document: 'readonly',
                MutationObserver: 'readonly',
                HTMLElement: 'readonly',
                Node: 'readonly',
                console: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly'
            }
        },
        rules: baseRules
    },
    {
        files: ['**/fixtures/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                module: 'readonly',
                exports: 'readonly',
                require: 'readonly'
            }
        },
        rules: baseRules
    }
];
