import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "scripts", "public", ".cache"] },
  ...tseslint.configs.recommended,
  {
    files: ["network-plugin/**/*.{js,cjs}"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, __storageDir__: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off", "@typescript-eslint/no-unused-vars": ["error", { caughtErrorsIgnorePattern: "^_" }] },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
