import { defineConfig, devices } from "@playwright/test";

// E2E journeys against the docker test stack:
//   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
// web_test (:5175) → api_test (:3101) → library_test DB.
export default defineConfig({
  testDir: "./e2e",
  // One worker: journeys share the test database through the seam.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env["TEST_WEB_URL"] ?? "http://127.0.0.1:5175",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
