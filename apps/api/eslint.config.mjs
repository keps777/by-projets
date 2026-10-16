import tseslint from "typescript-eslint";

// Règles volontairement sobres : le typage strict fait l'essentiel (tsc --noEmit), ESLint attrape
// ce qui échappe au compilateur (promesses oubliées, variables mortes, any).
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src/socle/db/generated/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["error", "log"] }],
    },
  },
);
