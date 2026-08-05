import tseslint from "typescript-eslint";

// Pocock-strict lint layer: typescript-eslint strict-type-checked plus a hard
// ban on type assertions (`as`, except `as const`) and non-null `!`. Narrowing
// is the only way past the compiler; openapi/generated is machine-owned and
// exempt.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "openapi/generated/**",
      // shadcn-vendored components are generator-owned, like openapi/generated.
      "web/src/components/ui/**",
      "api/**",
      ".scratch/**",
      ".dunning-kruger/**",
    ],
  },
  {
    files: ["web/src/**/*.{ts,tsx}", "tests/**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
          message: "Type assertions are banned; write a narrowing function instead (`as const` is allowed).",
        },
        {
          selector: "TSTypeAssertion",
          message: "Angle-bracket type assertions are banned; write a narrowing function instead.",
        },
      ],
      // React event handlers and setTimeout accept promise-returning callbacks
      // by design here; voiding at every call site is enforced instead.
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
    },
  },
);
