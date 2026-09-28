import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["shared/**/*.ts"],
    rules: {
      // shared/ must stay pure and deterministic (DESIGN.md §3, §6.3, §11).
      "no-restricted-imports": [
        "error",
        { patterns: ["three", "three/*", "colyseus", "@colyseus/*", "node:*"] },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use a seeded RNG passed in by the caller." },
      ],
      "no-restricted-globals": ["error", "window", "document", "process", "localStorage"],
    },
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["client/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
);
