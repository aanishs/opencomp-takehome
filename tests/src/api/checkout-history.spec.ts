import { describe, expect, it } from "vitest";
import { unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

describe("checkout history", () => {
  it("lists active checkouts first, then history, most recent first", async () => {
    const session = await createSession({ emailPrefix: "historian" });
    const created = await factory({
      books: Array.from({ length: 4 }, (_, index) => ({ title: `${unique("hist")} ${String(index)}` })),
    });
    const [expired1, expired2, returned, active] = created.books;
    if (!expired1 || !expired2 || !returned || !active) throw new Error("factory returned too few books");

    await factory({
      checkouts: [
        // Older expired
        { user_id: session.user.id, book_id: expired1.id, checked_out_at: "2025-11-01T00:00:00Z", expires_at: "2025-11-08T00:00:00Z" },
        // Newer expired
        { user_id: session.user.id, book_id: expired2.id, checked_out_at: "2026-01-10T00:00:00Z", expires_at: "2026-01-17T00:00:00Z" },
        // Returned early
        { user_id: session.user.id, book_id: returned.id, checked_out_at: "2026-02-01T00:00:00Z", expires_at: "2026-02-08T00:00:00Z", returned_at: "2026-02-02T00:00:00Z" },
      ],
    });
    await session.client.POST("/api/checkouts", { body: { book_id: active.id } });

    const result = await session.client.GET("/api/checkouts");
    await expect(result).toMatchApiSchema("/api/checkouts", "get", 200);

    const checkouts = result.data?.checkouts ?? [];
    expect(checkouts).toHaveLength(4);
    // Active first…
    expect(checkouts[0]?.book.id).toBe(active.id);
    expect(checkouts[0]?.active).toBe(true);
    // …then history by recency of creation.
    expect(checkouts.slice(1).map((checkout) => checkout.book.id)).toEqual([
      returned.id,
      expired2.id,
      expired1.id,
    ]);
    expect(checkouts.slice(1).every((checkout) => !checkout.active)).toBe(true);
  });

  it("reports returned and expired states distinctly", async () => {
    const session = await createSession({ emailPrefix: "states" });
    const created = await factory({ books: [{ title: unique("was-returned") }, { title: unique("lapsed") }] });
    const [returnedBook, expiredBook] = created.books;
    if (!returnedBook || !expiredBook) throw new Error("factory returned too few books");

    await factory({
      checkouts: [
        { user_id: session.user.id, book_id: returnedBook.id, checked_out_at: "2026-03-01T00:00:00Z", expires_at: "2026-03-08T00:00:00Z", returned_at: "2026-03-03T00:00:00Z" },
        { user_id: session.user.id, book_id: expiredBook.id, checked_out_at: "2026-03-01T00:00:00Z", expires_at: "2026-03-08T00:00:00Z" },
      ],
    });

    const result = await session.client.GET("/api/checkouts");
    const checkouts = result.data?.checkouts ?? [];
    const returned = checkouts.find((checkout) => checkout.book.id === returnedBook.id);
    const expired = checkouts.find((checkout) => checkout.book.id === expiredBook.id);

    expect(returned?.returned_at).not.toBeNull();
    expect(returned?.active).toBe(false);
    expect(expired?.returned_at).toBeNull();
    expect(expired?.active).toBe(false);
  });
});
