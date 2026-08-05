import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { http, makeBook, makeCheckout, paginationFor, sessionHandlers, testUser } from "./test/http";
import { server } from "./test/setup";

function emptyLibraryHandlers() {
  return [
    http.get("/api/books", ({ response }) => response(200).json({ books: [], pagination: paginationFor([]) })),
    http.get("/api/checkouts", ({ response }) => response(200).json({ checkouts: [], pagination: paginationFor([]) })),
  ];
}

describe("signing in", () => {
  it("logs in and lands in the library", async () => {
    server.use(
      http.get("/api/csrf", ({ response }) => response(200).json({ csrf_token: "test-csrf-token" })),
      http.get("/api/me", ({ response }) => response(401).json({ error: "Authentication required" })),
      http.post("/api/auth/login", ({ response }) => response(200).json({ user: testUser })),
      ...emptyLibraryHandlers(),
    );

    render(<App />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), testUser.email);
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(`Signed in as ${testUser.email}.`)).toBeInTheDocument();
  });

  it("renders the errors-list shape from a failed sign-up", async () => {
    server.use(
      http.get("/api/csrf", ({ response }) => response(200).json({ csrf_token: "test-csrf-token" })),
      http.get("/api/me", ({ response }) => response(401).json({ error: "Authentication required" })),
      http.post("/api/auth/sign_up", ({ response }) =>
        response(422).json({ errors: ["Email has already been taken", "Password is too short (minimum is 8 characters)"] })),
    );

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New here? Create an account" }));
    await user.type(screen.getByLabelText("Email"), "taken@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Email has already been taken, Password is too short (minimum is 8 characters)"),
    ).toBeInTheDocument();
  });
});

describe("the library", () => {
  it("renders search results with the live count", async () => {
    const books = [makeBook({ title: "The Time Machine" }), makeBook({ title: "Kindred" })];
    server.use(
      ...sessionHandlers(),
      http.get("/api/books", ({ response }) => response(200).json({ books, pagination: paginationFor(books) })),
      http.get("/api/checkouts", ({ response }) => response(200).json({ checkouts: [], pagination: paginationFor([]) })),
    );

    render(<App />);

    expect(await screen.findByText("The Time Machine")).toBeInTheDocument();
    expect(screen.getByText("Kindred")).toBeInTheDocument();
    expect(screen.getByText(/2 books/)).toBeInTheDocument();
  });

  it("checks out a book and updates the button and the borrowed count", async () => {
    const book = makeBook({ title: "Dune" });
    server.use(
      ...sessionHandlers(),
      http.get("/api/books", ({ response }) => response(200).json({ books: [book], pagination: paginationFor([book]) })),
      http.get("/api/checkouts", ({ response }) => response(200).json({ checkouts: [], pagination: paginationFor([]) })),
      http.post("/api/checkouts", ({ response }) => response(201).json({ checkout: makeCheckout(book) })),
    );

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Check out" }));

    expect(await screen.findByRole("button", { name: "Already checked out" })).toBeInTheDocument();
    expect(screen.getByText("1 of 10 books borrowed")).toBeInTheDocument();
    const panel = screen.getByText("Your checkouts").closest("aside");
    expect(panel).not.toBeNull();
    if (panel) expect(within(panel).getByText("Dune")).toBeInTheDocument();
  });
});

describe("the reader", () => {
  it("paginates content and resumes from the saved position and font size", async () => {
    const book = makeBook({ id: 42, title: "The Left Hand of Darkness" });
    // ~2.5 pages of content at 1800 chars/page.
    const content = "word ".repeat(900).trim();
    window.localStorage.setItem("reader-position-42", JSON.stringify({ page: 1, fontSize: "large" }));
    window.history.replaceState(null, "", "/read/42");

    server.use(
      ...sessionHandlers(),
      http.get("/api/books/{id}", ({ response }) => response(200).json({ book })),
      http.get("/api/books/{id}/read", ({ response }) => response(200).text(content)),
    );

    render(<App />);

    expect(await screen.findByText("The Left Hand of Darkness")).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of \d+/)).toBeInTheDocument();

    // A corrupt saved position must clamp, not crash — covered by the parse
    // guard; here we just confirm the happy restore path stuck.
    expect(screen.getByRole("button", { name: "A++" })).not.toHaveClass("secondary");
  });
});
