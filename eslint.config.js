// @ts-check
// Ported from BCUK-Bot-4's eslint.config.js so every BCUK repo is held to the same standards
// (see CLAUDE.md, "Code standards"). Keep the two in step when a shared rule changes.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import sonarjs from "eslint-plugin-sonarjs";
import vitest from "@vitest/eslint-plugin";
import html from "eslint-plugin-html";
import globals from "globals";

// CLAUDE.md "Docstrings": every function needs a JSDoc comment, and a stale one is worse than
// none. require-jsdoc covers function declarations, methods, and module-level arrow/function
// expressions; concise inline callbacks are exempt per CLAUDE.md, and constructors are covered
// by their class's JSDoc.
const jsdocRules = {
	"jsdoc/require-jsdoc": ["error", {
		publicOnly: false,
		checkConstructors: false,
		require: { FunctionDeclaration: true, MethodDefinition: true },
		// Module-level arrow/function expressions only (plain or exported `const x = () => …`);
		// small closures declared inside a function body count as inline callbacks.
		contexts: [
			"Program > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
			"Program > VariableDeclaration > VariableDeclarator > FunctionExpression",
			"Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
			"Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression",
		],
	}],
	"jsdoc/check-param-names": ["error", { checkDestructured: false }],
	"jsdoc/check-tag-names": "error",
};

export default tseslint.config(
	{
		ignores: ["node_modules/**", "dist/**", "com.expiredminotaur.bcuk.sdPlugin/bin/**", "eslint.config.js"],
	},
	js.configs.recommended,
	{
		// The property inspector's browser scripts: plain classic <script>s, no bundler. pi-common.js
		// shares its top-level functions with each page's inline script, so a name a script uses from
		// another is declared in a `/* global */` header at its top, and a top-level declaration that
		// only other scripts call isn't flagged as unused (`vars: 'local'`).
		files: ["com.expiredminotaur.bcuk.sdPlugin/ui/**/*.{js,html}"],
		plugins: { html, jsdoc },
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: "script",
			globals: { ...globals.browser },
		},
		rules: {
			"no-unused-vars": ["error", { vars: "local", args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none" }],
			eqeqeq: ["error", "always", { null: "ignore" }],
			"no-implied-eval": "error",
			"no-eval": "error",
			...jsdocRules,
		},
	},
	{
		// Node ES module scripts run directly (`npm run placeholders`), outside the TypeScript program.
		files: ["scripts/**/*.js"],
		plugins: { jsdoc },
		languageOptions: { sourceType: "module", globals: { ...globals.node } },
		rules: { ...jsdocRules },
	},
	{
		files: ["src/**/*.ts", "rolldown.config.ts", "vitest.config.ts"],
		extends: [...tseslint.configs.recommended],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"@typescript-eslint/no-floating-promises": "error",
			// `arguments: false` — passing an async function as a plain callback (setTimeout, an event
			// handler) is fine for handlers that already catch their own errors internally; only flag
			// misuse in conditionals/properties/etc.
			"@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-non-null-assertion": "off",
			// Log through streamDeck.logger, which ends up in the plugin's log file.
			"no-console": "error",
			complexity: ["error", 12],
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			"@typescript-eslint/only-throw-error": "error",
			"@typescript-eslint/prefer-promise-reject-errors": ["error", { allowThrowingUnknown: true }],
			"@typescript-eslint/require-await": "error",
			"@typescript-eslint/return-await": ["error", "in-try-catch"],
			"@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
			"max-depth": ["error", 3],
			"max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
			"no-nested-ternary": "error",
			"no-else-return": "error",
			"no-lonely-if": "error",
			eqeqeq: ["error", "always", { null: "ignore" }],
			"max-params": ["error", 5],
			"max-nested-callbacks": ["error", 3],
			"@typescript-eslint/await-thenable": "error",
			"@typescript-eslint/no-deprecated": "error",
			"@typescript-eslint/no-for-in-array": "error",
			"@typescript-eslint/no-implied-eval": "error",
			"@typescript-eslint/no-array-delete": "error",
			"@typescript-eslint/no-mixed-enums": "error",
			"@typescript-eslint/no-redundant-type-constituents": "error",
			"@typescript-eslint/no-duplicate-type-constituents": "error",
			"@typescript-eslint/no-unnecessary-type-parameters": "error",
			"@typescript-eslint/no-meaningless-void-operator": "error",
			"@typescript-eslint/prefer-return-this-type": "error",
			"@typescript-eslint/prefer-reduce-type-parameter": "error",
			"@typescript-eslint/no-misused-spread": "error",
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
			// Relies on tsconfig's noUncheckedIndexedAccess: without it, `items[0]` is typed as always
			// defined and this rule would flag real `if (!item)` guards as dead code.
			"@typescript-eslint/no-unnecessary-condition": "error",
			"@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
			"no-param-reassign": "error",
			"no-return-assign": "error",
			"array-callback-return": "error",
			"no-template-curly-in-string": "error",
			"no-self-compare": "error",
			"no-sequences": "error",
			"no-unreachable-loop": "error",
			"no-constructor-return": "error",
			radix: "error",
			"no-eval": "error",
			"no-new-func": "error",
			"default-case-last": "error",
			"guard-for-in": "error",
			"@typescript-eslint/prefer-readonly": "error",
			"@typescript-eslint/prefer-includes": "error",
			"@typescript-eslint/prefer-string-starts-ends-with": "error",
			"@typescript-eslint/prefer-find": "error",
			"@typescript-eslint/prefer-for-of": "error",
			"@typescript-eslint/no-unnecessary-template-expression": "error",
			"@typescript-eslint/default-param-last": "error",
			"@typescript-eslint/no-extraneous-class": "error",
			"@typescript-eslint/unified-signatures": "error",
			"@typescript-eslint/consistent-indexed-object-style": "error",
			"object-shorthand": "error",
			"prefer-template": "error",
			"no-useless-return": "error",
			"no-useless-rename": "error",
			"no-useless-concat": "error",
			"no-useless-computed-key": "error",
			"no-unneeded-ternary": "error",
			"logical-assignment-operators": "error",
			"@typescript-eslint/prefer-optional-chain": "error",
			"@typescript-eslint/no-unnecessary-type-arguments": "error",
			"max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
		},
	},
	{
		// The build config reports `streamdeck restart` output while watching; there's no logger there.
		files: ["rolldown.config.ts"],
		rules: { "no-console": "off" },
	},
	{
		// Complexity/simplification rules from SonarJS, source files only. cognitive-complexity is the
		// metric Qlty's "function complexity" smell uses, so this catches that review finding locally.
		files: ["src/**/*.ts"],
		ignores: ["src/**/*.test.ts", "src/test-utils/**/*.ts"],
		plugins: { sonarjs },
		rules: {
			"sonarjs/cognitive-complexity": ["error", 15],
			"sonarjs/no-identical-functions": "error",
			"sonarjs/no-collapsible-if": "error",
			"sonarjs/no-inverted-boolean-check": "error",
			"sonarjs/no-redundant-boolean": "error",
			"sonarjs/no-redundant-jump": "error",
			"sonarjs/no-small-switch": "error",
			"sonarjs/no-nested-switch": "error",
			"sonarjs/max-switch-cases": "error",
			"sonarjs/no-nested-conditional": "error",
			"sonarjs/no-nested-template-literals": "error",
			"sonarjs/no-gratuitous-expressions": "error",
			"sonarjs/no-all-duplicated-branches": "error",
			"sonarjs/no-duplicated-branches": "error",
			"sonarjs/no-identical-conditions": "error",
			"sonarjs/prefer-single-boolean-return": "error",
			"sonarjs/prefer-immediate-return": "error",
		},
	},
	{
		// Tests legitimately use long describe/it callbacks, deep nesting, casts and async mocks
		// without awaits, so the structure/async rules above apply to source files only.
		files: ["src/**/*.test.ts", "src/test-utils/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			complexity: "off",
			"@typescript-eslint/switch-exhaustiveness-check": "off",
			"@typescript-eslint/only-throw-error": "off",
			"@typescript-eslint/prefer-promise-reject-errors": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/return-await": "off",
			"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
			"max-depth": "off",
			"max-lines-per-function": "off",
			"no-nested-ternary": "off",
			"no-else-return": "off",
			"no-lonely-if": "off",
			eqeqeq: "off",
			"max-params": "off",
			"max-nested-callbacks": "off",
			"@typescript-eslint/await-thenable": "off",
			"@typescript-eslint/no-meaningless-void-operator": "off",
			"@typescript-eslint/no-extraneous-class": "off",
			"@typescript-eslint/no-unnecessary-type-parameters": "off",
			"@typescript-eslint/no-redundant-type-constituents": "off",
			"@typescript-eslint/prefer-readonly": "off",
			"prefer-template": "off",
			"max-lines": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/no-unnecessary-condition": "off",
		},
	},
	{
		// Every function in source needs a JSDoc comment; test files are exempt.
		files: ["src/**/*.ts", "rolldown.config.ts", "vitest.config.ts"],
		ignores: ["src/**/*.test.ts"],
		plugins: { jsdoc },
		settings: { jsdoc: { mode: "typescript" } },
		rules: {
			...jsdocRules,
			// Types live in the TypeScript signature; a JSDoc {type} would just drift from it.
			"jsdoc/no-types": "error",
		},
	},
	{
		// A stray `.only`/`.skip` or an assertion-free test silently weakens CI.
		files: ["src/**/*.test.ts"],
		plugins: { vitest },
		rules: {
			...vitest.configs.recommended.rules,
			"vitest/no-disabled-tests": "error",
			"vitest/expect-expect": ["error", { assertFunctionNames: ["expect*"] }],
			// Vitest's expect takes an optional message (e.g. which loop input failed) as its 2nd argument.
			"vitest/valid-expect": ["error", { maxArgs: 2 }],
		},
	},
);
