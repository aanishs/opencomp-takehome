import { defineConfig } from "vitest/config";

// Two projects: "api" runs the black-box suite with normal file parallelism;
// "ratelimit" runs alone and serially, because exercising the per-IP 429
// consumes the shared rate-limit budget and would poison concurrent specs.
// test:api runs them in that order.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "api",
          include: ["src/api/**/*.spec.ts"],
          globalSetup: "./src/helpers/global-setup.ts",
          setupFiles: ["./src/helpers/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: "ratelimit",
          include: ["src/ratelimit/**/*.spec.ts"],
          globalSetup: "./src/helpers/global-setup.ts",
          setupFiles: ["./src/helpers/setup.ts"],
          sequence: { concurrent: false },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
