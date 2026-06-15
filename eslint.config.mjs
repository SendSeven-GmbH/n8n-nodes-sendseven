// ESLint 9 flat config for the SendSeven n8n community node.
//
// Replaces the legacy (and previously missing/broken) .eslintrc setup. Uses the
// unified `typescript-eslint` package, which supersedes the old
// `@typescript-eslint/parser` dependency that carried the audit advisories.
//
// Scope: build-tooling/lint only — this does not affect the shipped dist/ output.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		// Never lint build output or vendored deps.
		ignores: ['dist/**', 'node_modules/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
			},
		},
		rules: {
			// The node code legitimately uses `any` against loosely-typed n8n
			// request/response payloads; keep this advisory, not blocking.
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
		},
	},
);
