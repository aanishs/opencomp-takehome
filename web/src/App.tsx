import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  isRecord,
  parseBookResponse,
  parseBooksResponse,
  parseCheckoutResponse,
  parseCheckoutsResponse,
  parseCsrfResponse,
  parseUserResponse,
} from "./api/types";
import type { Book, Checkout, Pagination, User } from "./api/types";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// App registers a handler here so a 401 from any authenticated request drops
// the user back to the sign-in screen instead of stranding them in the app.
let onUnauthorized: (() => void) | null = null;

function errorMessage(body: unknown): string {
  if (isRecord(body)) {
    if (Array.isArray(body.errors)) {
      const messages = body.errors.filter((entry): entry is string => typeof entry === "string");
      if (messages.length > 0) return messages.join(", ");
    }
    if (typeof body.error === "string" && body.error) return body.error;
  }
  return "Something went wrong";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

async function responseBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(errorMessage(body), response.status);
  }

  return body;
}

// Only same-origin absolute paths are safe to navigate to; anything else
// (//evil.com, https://…, javascript:) is rejected in favor of the library root.
function safeInternalPath(value: string | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

const READER_PAGE_CHARS = 1800;
const READER_FONT_SIZES = { small: "1rem", medium: "1.15rem", large: "1.35rem" } as const;
type FontSize = keyof typeof READER_FONT_SIZES;
const FONT_SIZE_KEYS: readonly FontSize[] = ["small", "medium", "large"];

// hasOwnProperty, not `in` — `in` matches inherited keys like "toString" or
// "constructor" from a tampered localStorage value.
function isFontSize(value: unknown): value is FontSize {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(READER_FONT_SIZES, value);
}

// Split on word boundaries near the target page size so pages never cut a
// word in half; falls back to a hard cut for pathological unbroken text.
function paginateText(text: string): string[] {
  const pages: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + READER_PAGE_CHARS, text.length);
    if (end < text.length) {
      const breakAt = Math.max(text.lastIndexOf(" ", end), text.lastIndexOf("\n", end));
      if (breakAt > start) end = breakAt;
    }
    pages.push(text.slice(start, end).trimStart());
    start = end;
  }

  return pages.length ? pages : [""];
}

interface ReaderState {
  page?: number;
  fontSize?: FontSize;
}

// A stale or tampered localStorage entry can hold anything; only integer
// pages and known font sizes survive parsing.
function parseReaderState(raw: string | null): ReaderState {
  if (raw === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  const state: ReaderState = {};
  if (typeof parsed.page === "number" && Number.isInteger(parsed.page)) state.page = parsed.page;
  if (isFontSize(parsed.fontSize)) state.fontSize = parsed.fontSize;
  return state;
}

function ReaderPage({ onSignOut }: { onSignOut: () => void }) {
  const bookId = window.location.pathname.split("/").at(-1) ?? "";
  const storageKey = `reader-position-${bookId}`;
  const [book, setBook] = useState<Book | null>(null);
  const [bookContent, setBookContent] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [error, setError] = useState("");

  const pages = useMemo(() => paginateText(bookContent ?? ""), [bookContent]);

  useEffect(() => {
    async function loadBook() {
      try {
        const [bookResponse, contentResponse] = await Promise.all([
          fetch(`${apiUrl}/api/books/${bookId}`, { credentials: "include" }),
          fetch(`${apiUrl}/api/books/${bookId}/read`, { credentials: "include" }),
        ]);
        const bookBody = parseBookResponse(await responseBody(bookResponse));
        if (!contentResponse.ok) await responseBody(contentResponse);

        const content = await contentResponse.text();
        setBook(bookBody.book);

        // Restore the saved position, clamped so a stale or corrupt entry
        // (edited content, cleared pages) can never point past the end.
        const saved = parseReaderState(localStorage.getItem(storageKey));
        const pageCount = paginateText(content).length;
        setPageIndex(Math.min(Math.max(saved.page ?? 0, 0), pageCount - 1));
        if (saved.fontSize) setFontSize(saved.fontSize);
        setBookContent(content);
      } catch (loadError) {
        setError(messageOf(loadError));
      }
    }

    void loadBook();
  }, [bookId, storageKey]);

  useEffect(() => {
    if (bookContent === null) return;
    localStorage.setItem(storageKey, JSON.stringify({ page: pageIndex, fontSize }));
  }, [pageIndex, fontSize, bookContent, storageKey]);

  useEffect(() => {
    function turnPage(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") setPageIndex((current) => Math.max(current - 1, 0));
      if (event.key === "ArrowRight") setPageIndex((current) => Math.min(current + 1, pages.length - 1));
    }

    window.addEventListener("keydown", turnPage);
    return () => { window.removeEventListener("keydown", turnPage); };
  }, [pages.length]);

  const percentComplete = Math.round(((pageIndex + 1) / pages.length) * 100);

  return (
    <main className="reader-page">
      <header className="reader-header">
        <button
          className="secondary"
          onClick={() => { window.location.assign(safeInternalPath(sessionStorage.getItem("libraryReturnUrl"))); }}
        >
          Back to library
        </button>
        <div className="font-controls" role="group" aria-label="Font size">
          {FONT_SIZE_KEYS.map((size) => (
            <button
              key={size}
              className={size === fontSize ? "" : "secondary"}
              onClick={() => { setFontSize(size); }}
            >
              {size === "small" ? "A" : size === "medium" ? "A+" : "A++"}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      {error && <p className="error">{error}</p>}
      {!error && bookContent === null && <p>Loading book…</p>}
      {book && bookContent !== null && (
        <article className="reader-content">
          <p className="eyebrow">Now reading</p>
          <h1>{book.title}</h1>
          <p className="author">{book.author}</p>
          <div style={{ fontSize: READER_FONT_SIZES[fontSize] }}>{pages[pageIndex] ?? ""}</div>
          <nav className="reader-nav" aria-label="Reader pagination">
            <button
              className="secondary"
              disabled={pageIndex <= 0}
              onClick={() => { setPageIndex(pageIndex - 1); }}
            >
              Previous
            </button>
            <span>Page {pageIndex + 1} of {pages.length} · {percentComplete}%</span>
            <button
              className="secondary"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => { setPageIndex(pageIndex + 1); }}
            >
              Next
            </button>
          </nav>
        </article>
      )}
    </main>
  );
}

const SORTS = ["title", "author", "year"] as const;
type Sort = (typeof SORTS)[number];

function isSort(value: string | null): value is Sort {
  return value !== null && SORTS.includes(value);
}

interface LibraryUrlState {
  query: string;
  page: number;
  sort: Sort;
  availableOnly: boolean;
}

function libraryUrlState(): LibraryUrlState {
  const params = new URLSearchParams(window.location.search);
  const page = parseInt(params.get("page") ?? "", 10);
  const sortParam = params.get("sort");

  return {
    query: params.get("query") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: isSort(sortParam) ? sortParam : "title",
    availableOnly: params.get("available_only") === "true",
  };
}

interface LibraryProps {
  user: User;
  csrfToken: string | null;
  onSignOut: () => void;
}

function Library({ user, csrfToken, onSignOut }: LibraryProps) {
  const initial = libraryUrlState();
  const [books, setBooks] = useState<Book[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [query, setQuery] = useState(initial.query);
  const [page, setPage] = useState(initial.page);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [availableOnly, setAvailableOnly] = useState(initial.availableOnly);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState<number | null>(null);
  const [returningId, setReturningId] = useState<number | null>(null);
  const [searchError, setSearchError] = useState("");
  const [actionError, setActionError] = useState("");
  const requestGeneration = useRef(0);

  useEffect(() => {
    void loadCheckouts();
  }, []);

  // Debounced book loading. The generation counter discards responses that
  // resolve out of order, so a slow older query can never overwrite a newer one.
  useEffect(() => {
    const generation = ++requestGeneration.current;
    const timer = setTimeout(() => loadBooks(generation), 300);
    return () => { clearTimeout(timer); };
  }, [query, page, sort, availableOnly]);

  // Bumps the generation by default so an ad-hoc reload (after a checkout or
  // return) invalidates any in-flight debounced search.
  async function loadBooks(generation = ++requestGeneration.current) {
    setLoadingBooks(true);
    try {
      const params = new URLSearchParams({ query, page: String(page), sort });
      if (availableOnly) params.set("available_only", "true");
      const body = parseBooksResponse(
        await responseBody(await fetch(`${apiUrl}/api/books?${params.toString()}`, { credentials: "include" })),
      );
      if (requestGeneration.current !== generation) return;
      setBooks(body.books);
      setPagination(body.pagination);
      setSearchError("");
      // Snap an out-of-range page (e.g. ?page=99999) back to the last real page.
      if (body.pagination.total_pages > 0 && page > body.pagination.total_pages) {
        setPage(body.pagination.total_pages);
      }
    } catch (loadError) {
      if (requestGeneration.current === generation) setSearchError(messageOf(loadError));
    } finally {
      if (requestGeneration.current === generation) setLoadingBooks(false);
    }
  }

  // Mirror search state into the URL so reload, back, and the reader
  // round-trip land on the same view.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (page > 1) params.set("page", String(page));
    if (sort !== "title") params.set("sort", sort);
    if (availableOnly) params.set("available_only", "true");
    const target = params.size ? `/?${params.toString()}` : "/";
    const current = window.location.pathname + window.location.search;
    if (current !== target) window.history.replaceState(null, "", target);
  }, [query, page, sort, availableOnly]);

  useEffect(() => {
    function restoreFromUrl() {
      const state = libraryUrlState();
      setQuery(state.query);
      setPage(state.page);
      setSort(state.sort);
      setAvailableOnly(state.availableOnly);
    }

    window.addEventListener("popstate", restoreFromUrl);
    return () => { window.removeEventListener("popstate", restoreFromUrl); };
  }, []);

  async function loadCheckouts() {
    try {
      const body = parseCheckoutsResponse(
        await responseBody(await fetch(`${apiUrl}/api/checkouts`, { credentials: "include" })),
      );
      setCheckouts(body.checkouts);
    } catch (loadError) {
      setActionError(messageOf(loadError));
    }
  }

  function updateSearch(changes: Partial<LibraryUrlState>) {
    if (changes.query !== undefined) setQuery(changes.query);
    if (changes.sort !== undefined) setSort(changes.sort);
    if (changes.availableOnly !== undefined) setAvailableOnly(changes.availableOnly);
    setPage(changes.page ?? 1);
  }

  function csrfHeader(): Record<string, string> {
    return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  }

  async function checkOut(book: { id: number }) {
    setActionError("");
    setCheckingOutId(book.id);

    try {
      const result = parseCheckoutResponse(
        await responseBody(
          await fetch(`${apiUrl}/api/checkouts`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...csrfHeader() },
            body: JSON.stringify({ book_id: book.id }),
          }),
        ),
      );
      setCheckouts((current) => [...current, result.checkout]);
      setBooks((current) => current.map((currentBook) => (
        currentBook.id === book.id
          ? { ...currentBook, active_checkout_count: currentBook.active_checkout_count + 1, available: currentBook.active_checkout_count + 1 < 5 }
          : currentBook
      )));
    } catch (checkoutError) {
      setActionError(messageOf(checkoutError));
    } finally {
      setCheckingOutId(null);
    }
  }

  async function returnBook(checkout: Checkout) {
    setActionError("");
    setReturningId(checkout.id);

    try {
      const result = parseCheckoutResponse(
        await responseBody(
          await fetch(`${apiUrl}/api/checkouts/${String(checkout.id)}/return`, {
            method: "POST",
            credentials: "include",
            headers: csrfHeader(),
          }),
        ),
      );
      setCheckouts((current) => current.map((existing) => (
        existing.id === checkout.id ? result.checkout : existing
      )));
      setBooks((current) => current.map((book) => (
        book.id === checkout.book.id
          ? { ...book, active_checkout_count: Math.max(0, book.active_checkout_count - 1), available: true }
          : book
      )));
    } catch (returnError) {
      setActionError(messageOf(returnError));
    } finally {
      setReturningId(null);
    }
  }

  function readBook(checkout: Checkout) {
    sessionStorage.setItem("libraryReturnUrl", window.location.pathname + window.location.search);
    window.location.assign(`/read/${String(checkout.book.id)}`);
  }

  const activeCheckoutIds = new Set(checkouts.filter((checkout) => checkout.active).map((checkout) => checkout.book.id));
  const activeCheckouts = checkouts.filter((checkout) => checkout.active);
  const historyCheckouts = checkouts
    .filter((checkout) => !checkout.active)
    .sort((a, b) =>
      new Date(b.returned_at ?? b.expires_at).getTime() - new Date(a.returned_at ?? a.expires_at).getTime());
  const atUserLimit = activeCheckouts.length >= 10;
  const libraryError = searchError || actionError;

  function historyAction(checkout: Checkout): { label: string; disabled: boolean } {
    if (activeCheckoutIds.has(checkout.book.id)) return { label: "Borrowed", disabled: true };
    if (!checkout.book.available) return { label: "Unavailable", disabled: true };
    if (atUserLimit) return { label: "Limit reached", disabled: true };
    return { label: checkingOutId === checkout.book.id ? "Checking out…" : "Check out again", disabled: checkingOutId === checkout.book.id };
  }

  return (
    <main className="library-shell">
      <header className="library-header">
        <div>
          <p className="eyebrow">Online library</p>
          <h1>Find your next read.</h1>
          <p>Signed in as {user.email}.</p>
        </div>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>

      <section className="library-layout">
        <div>
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); }}>
            <input
              aria-label="Search by title, author, or ISBN"
              value={query}
              onChange={(event) => { updateSearch({ query: event.target.value }); }}
              placeholder="Search title, author, or ISBN"
            />
            <select
              aria-label="Sort books"
              value={sort}
              onChange={(event) => {
                const value = event.target.value;
                updateSearch({ sort: isSort(value) ? value : "title" });
              }}
            >
              <option value="title">Sort by title</option>
              <option value="author">Sort by author</option>
              <option value="year">Newest first</option>
            </select>
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => { updateSearch({ availableOnly: event.target.checked }); }}
              />
              Available now
            </label>
          </form>

          {libraryError && <p className="error" aria-live="polite">{libraryError}</p>}
          {pagination && (
            <p className="result-count" aria-live="polite">
              {pagination.total_count.toLocaleString()} {pagination.total_count === 1 ? "book" : "books"}
              {loadingBooks && " — updating…"}
            </p>
          )}
          {loadingBooks && !pagination ? <p>Loading books…</p> : (
            <div className="book-grid">
              {books.map((book) => {
                const alreadyCheckedOut = activeCheckoutIds.has(book.id);
                const unavailable = !book.available || alreadyCheckedOut;

                return (
                  <article className="book-card" key={book.id}>
                    <p className="book-meta">{book.published_year ?? "Year unknown"}</p>
                    <h2>{book.title}</h2>
                    <p className="author">{book.author}</p>
                    {book.description && <p>{book.description}</p>}
                    <p className={book.available ? "availability" : "availability unavailable"}>
                      {book.available ? `${String(5 - book.active_checkout_count)} copies available` : "All copies checked out"}
                    </p>
                    <button disabled={unavailable || checkingOutId === book.id} onClick={() => void checkOut(book)}>
                      {checkingOutId === book.id ? "Checking out…" : alreadyCheckedOut ? "Already checked out" : book.available ? "Check out" : "Unavailable"}
                    </button>
                  </article>
                );
              })}
              {!books.length && <p>No books matched your search.</p>}
            </div>
          )}
          {pagination && pagination.total_pages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => { setPage(page - 1); }}
              >
                Previous
              </button>
              <span>Page {Math.min(page, pagination.total_pages)} of {pagination.total_pages}</span>
              <button
                className="secondary"
                disabled={page >= pagination.total_pages}
                onClick={() => { setPage(page + 1); }}
              >
                Next
              </button>
            </nav>
          )}
        </div>

        <aside className="checkout-panel">
          <p className="eyebrow">Your checkouts</p>
          <h2>{activeCheckouts.length} of 10 books borrowed</h2>
          {activeCheckouts.length ? (
            <ul>
              {activeCheckouts.map((checkout) => (
                <li key={checkout.id}>
                  <strong>{checkout.book.title}</strong>
                  <span>Due {formatDate(checkout.expires_at)}</span>
                  <button className="read-button" onClick={() => { readBook(checkout); }}>Read</button>
                  <button
                    className="secondary"
                    disabled={returningId === checkout.id}
                    onClick={() => void returnBook(checkout)}
                  >
                    {returningId === checkout.id ? "Returning…" : "Return"}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p>Nothing checked out yet.</p>}

          {historyCheckouts.length > 0 && (
            <div className="history-section">
              <p className="eyebrow">History</p>
              <ul>
                {historyCheckouts.map((checkout) => {
                  const action = historyAction(checkout);

                  return (
                    <li key={checkout.id}>
                      <strong>{checkout.book.title}</strong>
                      <span>Borrowed {formatDate(checkout.checked_out_at)}</span>
                      <span>
                        {checkout.returned_at
                          ? `Returned ${formatDate(checkout.returned_at)}`
                          : `Expired ${formatDate(checkout.expires_at)}`}
                      </span>
                      <button
                        className="read-button secondary"
                        disabled={action.disabled}
                        onClick={() => void checkOut(checkout.book)}
                      >
                        {action.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </section>

    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Register the module-level 401 handler declared next to responseBody: an
  // expired session anywhere in the app lands back on the sign-in screen.
  useEffect(() => {
    onUnauthorized = () => { setUser(null); };
    return () => { onUnauthorized = null; };
  }, []);

  useEffect(() => {
    async function loadSession() {
      try {
        const csrf = parseCsrfResponse(
          await responseBody(await fetch(`${apiUrl}/api/csrf`, { credentials: "include" })),
        );
        setCsrfToken(csrf.csrf_token);

        const session = await fetch(`${apiUrl}/api/me`, { credentials: "include" });
        if (session.ok) setUser(parseUserResponse(await session.json()).user);
      } catch (loadError) {
        setError(messageOf(loadError));
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, []);

  // Login, sign-up, and logout all reset the server session, which
  // invalidates the CSRF token issued before — fetch a fresh one.
  async function refreshCsrfToken() {
    try {
      const csrf = parseCsrfResponse(
        await responseBody(await fetch(`${apiUrl}/api/csrf`, { credentials: "include" })),
      );
      setCsrfToken(csrf.csrf_token);
    } catch {
      // Keep the old token; the next mutating request will surface the error.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setSubmitting(true);

    const form = new FormData(formElement);
    const field = (name: string): string => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    const signingUp = mode === "signUp";
    const payload = signingUp
      ? {
          user: {
            email: field("email"),
            password: field("password"),
            password_confirmation: field("passwordConfirmation"),
          },
        }
      : { email: field("email"), password: field("password") };

    try {
      const result = parseUserResponse(
        await responseBody(
          await fetch(`${apiUrl}/api/auth/${signingUp ? "sign_up" : "login"}`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
            body: JSON.stringify(payload),
          }),
        ),
      );
      await refreshCsrfToken();
      setUser(result.user);
      formElement.reset();
    } catch (submitError) {
      setError(messageOf(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setError("");

    try {
      const response = await fetch(`${apiUrl}/api/auth/logout`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      });
      if (!response.ok) await responseBody(response);
      await refreshCsrfToken();
      setUser(null);
    } catch (signOutError) {
      setError(messageOf(signOutError));
    }
  }

  if (loading) {
    return <main className="shell">Loading library…</main>;
  }

  if (user) {
    if (window.location.pathname.startsWith("/read/")) {
      return <ReaderPage onSignOut={() => void signOut()} />;
    }

    return <Library user={user} csrfToken={csrfToken} onSignOut={() => void signOut()} />;
  }

  const signingUp = mode === "signUp";

  return (
    <main className="shell">
      <p className="eyebrow">Online library</p>
      <h1>{signingUp ? "Create your account" : "Welcome back"}</h1>
      <p className="intro">
        {signingUp ? "Start borrowing books from the library." : "Sign in to browse the library."}
      </p>

      <form onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required />
        </label>
        {signingUp && (
          <label>
            Confirm password
            <input name="passwordConfirmation" type="password" autoComplete="new-password" required />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting || !csrfToken}>
          {submitting ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>
      <button className="link-button" onClick={() => { setMode(signingUp ? "signIn" : "signUp"); setError(""); }}>
        {signingUp ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  );
}
