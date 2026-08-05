import { BASE_URL } from "./config";
import { reset } from "./seam";

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/up`);
      if (response.ok) return;
      lastError = `HTTP ${String(response.status)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Test API server not reachable at ${BASE_URL} (${lastError}).\n` +
      "Start it with: docker compose -f docker-compose.yml -f docker-compose.test.yml up -d api_test",
  );
}

export default async function globalSetup(): Promise<void> {
  await waitForServer();
  await reset();
}
