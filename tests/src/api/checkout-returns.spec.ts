import { describe, expect, it } from "vitest";
import { unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

describe("returning checkouts", () => {
  it("returns an active checkout and stamps returned_at", async () => {
    const session = await createSession({ emailPrefix: "returner" });
    const created = await factory({ books: [{ title: unique("returnable") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const borrowed = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    const checkoutId = borrowed.data?.checkout.id;
    if (checkoutId === undefined) throw new Error("no checkout created");

    const returned = await session.client.POST("/api/checkouts/{id}/return", {
      params: { path: { id: checkoutId } },
    });
    await expect(returned).toMatchApiSchema("/api/checkouts/{id}/return", "post", 200);
    expect(returned.data?.checkout.active).toBe(false);
    expect(returned.data?.checkout.returned_at).not.toBeNull();
  });

  it("rejects a double return", async () => {
    const session = await createSession();
    const created = await factory({ books: [{ title: unique("once-only") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const borrowed = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    const checkoutId = borrowed.data?.checkout.id;
    if (checkoutId === undefined) throw new Error("no checkout created");

    await session.client.POST("/api/checkouts/{id}/return", { params: { path: { id: checkoutId } } });
    const again = await session.client.POST("/api/checkouts/{id}/return", { params: { path: { id: checkoutId } } });
    await expect(again).toMatchApiSchema("/api/checkouts/{id}/return", "post", 422);
    expect(again.error?.error).toBe("This checkout is no longer active");
  });

  it("rejects returning an expired checkout", async () => {
    const session = await createSession({ emailPrefix: "late" });
    const created = await factory({ books: [{ title: unique("overdue") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");
    const seeded = await factory({
      checkouts: [{
        user_id: session.user.id,
        book_id: book.id,
        checked_out_at: "2025-12-25T00:00:00Z",
        expires_at: "2026-01-01T00:00:00Z",
      }],
    });
    const checkout = seeded.checkouts[0];
    if (!checkout) throw new Error("factory returned no checkout");

    const result = await session.client.POST("/api/checkouts/{id}/return", {
      params: { path: { id: checkout.id } },
    });
    await expect(result).toMatchApiSchema("/api/checkouts/{id}/return", "post", 422);
  });

  it("404s when returning another user's checkout", async () => {
    const owner = await createSession({ emailPrefix: "owns-it" });
    const intruder = await createSession({ emailPrefix: "not-owner" });
    const created = await factory({ books: [{ title: unique("someone-elses") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const borrowed = await owner.client.POST("/api/checkouts", { body: { book_id: book.id } });
    const checkoutId = borrowed.data?.checkout.id;
    if (checkoutId === undefined) throw new Error("no checkout created");

    const result = await intruder.client.POST("/api/checkouts/{id}/return", {
      params: { path: { id: checkoutId } },
    });
    await expect(result).toMatchApiSchema("/api/checkouts/{id}/return", "post", 404);
  });

  it("frees a copy of a saturated book immediately", async () => {
    const marker = unique("free-up");
    const created = await factory({
      users: Array.from({ length: 5 }, (_, index) => ({ email: `${marker}-u${String(index)}@example.com` })),
      books: [{ title: `${marker} Book` }],
    });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");
    const seeded = await factory({
      checkouts: created.users.map((user) => ({ user_id: user.id, book_id: book.id })),
    });
    const firstCheckout = seeded.checkouts[0];
    const firstUser = created.users[0];
    if (!firstCheckout || !firstUser) throw new Error("missing seeded checkout");

    const waiting = await createSession({ emailPrefix: "waiting" });
    const blocked = await waiting.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(blocked).toMatchApiSchema("/api/checkouts", "post", 422);

    const { sessionFor } = await import("../helpers/session");
    const holder = await sessionFor(firstUser);
    await holder.client.POST("/api/checkouts/{id}/return", { params: { path: { id: firstCheckout.id } } });

    const unblocked = await waiting.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(unblocked).toMatchApiSchema("/api/checkouts", "post", 201);
  });
});
