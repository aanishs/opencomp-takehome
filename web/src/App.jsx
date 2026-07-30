import { useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function responseBody(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.errors?.join(", ") || body.error || "Something went wrong");
  }

  return body;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("signIn");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const csrf = await responseBody(
          await fetch(`${apiUrl}/api/csrf`, { credentials: "include" }),
        );
        setCsrfToken(csrf.csrf_token);

        const session = await fetch(`${apiUrl}/api/me`, { credentials: "include" });
        if (session.ok) setUser((await session.json()).user);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const signingUp = mode === "signUp";
    const payload = signingUp
      ? {
          user: {
            email: form.get("email"),
            password: form.get("password"),
            password_confirmation: form.get("passwordConfirmation"),
          },
        }
      : { email: form.get("email"), password: form.get("password") };

    try {
      const result = await responseBody(
        await fetch(`${apiUrl}/api/auth/${signingUp ? "sign_up" : "login"}`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(payload),
        }),
      );
      setUser(result.user);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError.message);
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
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) await responseBody(response);
      setUser(null);
    } catch (signOutError) {
      setError(signOutError.message);
    }
  }

  if (loading) {
    return <main className="shell">Loading library…</main>;
  }

  if (user) {
    return (
      <main className="shell">
        <p className="eyebrow">Online library</p>
        <div className="welcome-row">
          <div>
            <h1>Welcome, reader.</h1>
            <p>You are signed in as {user.email}.</p>
          </div>
          <button className="secondary" onClick={signOut}>Sign out</button>
        </div>
        <section className="placeholder">
          <h2>Your library is almost ready</h2>
          <p>Book search and checkout functionality will be added next.</p>
        </section>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const signingUp = mode === "signUp";

  return (
    <main className="shell">
      <p className="eyebrow">Online library</p>
      <h1>{signingUp ? "Create your account" : "Welcome back"}</h1>
      <p className="intro">
        {signingUp ? "Start borrowing books from the library." : "Sign in to browse the library."}
      </p>

      <form onSubmit={submit}>
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
