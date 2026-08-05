import { describe, expect, it } from "vitest";
import { BASE_URL, unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

describe("pagination", () => {
  it("pages checkouts with the documented envelope and bounds", async () => {
    const session = await createSession({ emailPrefix: "pager" });
    const created = await factory({
      books: Array.from({ length: 30 }, (_, index) => ({ title: `${unique("page")} ${String(index)}` })),
    });
    // 30 history rows (expired), so nothing fights the 10-active cap.
    await factory({
      checkouts: created.books.map((book) => ({
        user_id: session.user.id,
        book_id: book.id,
        checked_out_at: "2025-10-01T00:00:00Z",
        expires_at: "2025-10-08T00:00:00Z",
      })),
    });

    const firstPage = await session.client.GET("/api/checkouts", { params: { query: { per_page: 12 } } });
    await expect(firstPage).toMatchApiSchema("/api/checkouts", "get", 200);
    expect(firstPage.data?.checkouts).toHaveLength(12);
    expect(firstPage.data?.pagination).toEqual({ page: 1, per_page: 12, total_pages: 3, total_count: 30 });

    const lastPage = await session.client.GET("/api/checkouts", { params: { query: { page: 3, per_page: 12 } } });
    expect(lastPage.data?.checkouts).toHaveLength(6);

    const beyond = await session.client.GET("/api/checkouts", { params: { query: { page: 99, per_page: 12 } } });
    await expect(beyond).toMatchApiSchema("/api/checkouts", "get", 200);
    expect(beyond.data?.checkouts).toHaveLength(0);
    expect(beyond.data?.pagination.total_count).toBe(30);
  });

  it("clamps per_page to the 100 maximum", async () => {
    const session = await createSession();
    // The typed client won't let us send per_page: 5000 (the contract caps it
    // at 100), which is the point — so this asserts the server clamps a raw
    // over-limit request the same way the contract promises.
    const response = await session.fetch(`${BASE_URL}/api/checkouts?per_page=5000`);
    const body: unknown = await response.json();
    expect(response.status).toBe(200);
    const perPage =
      typeof body === "object" && body !== null && "pagination" in body &&
      typeof body.pagination === "object" && body.pagination !== null && "per_page" in body.pagination
        ? body.pagination.per_page
        : undefined;
    expect(perPage).toBe(100);
  });

  it("treats malformed page values as page 1 instead of erroring", async () => {
    const session = await createSession();
    // Rack bracket syntax turns page into an array — the server must coerce,
    // not 500 (Paginatable#scalar_param).
    const response = await session.fetch(`${BASE_URL}/api/checkouts?page[]=9`);
    expect(response.status).toBe(200);
  });
});
