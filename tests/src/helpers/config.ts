// 127.0.0.1, never `localhost` — localhost can resolve to ::1 and hit an
// unrelated dev server (see docker-compose.test.yml).
export const BASE_URL = process.env["TEST_API_URL"] ?? "http://127.0.0.1:3101";

let counter = 0;

// Unique-enough email/marker factory: the suite runs against a shared
// database that is only reset once per run, so every spec file namespaces
// its own records instead of assuming an empty world.
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid.toString(36)}${Date.now().toString(36)}-${counter.toString()}`;
}

export function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}
