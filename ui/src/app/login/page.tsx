"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "setup";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>("login");
  const [token, setToken] = useState("");
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: check if already authenticated, and detect first-run setup mode.
  useEffect(() => {
    const init = async () => {
      // If already authenticated, bounce to home.
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (meRes.ok) {
          router.replace("/");
          return;
        }
      } catch {
        // network error — continue to login form
      }

      // Check whether this is first-run (token was just auto-generated).
      // We detect this by calling GET /api/auth/token which only succeeds when
      // authenticated, but the login route also exposes isNew via a special
      // first-run sentinel. Instead we POST with an empty string to probe —
      // the server returns 401, and we inspect whether a token already existed
      // by requesting the token endpoint after a successful login. For the
      // setup flow, we have a dedicated probe: if no token exists yet the
      // server will create one on first getOrCreateToken() call. We call
      // /api/auth/me which triggers getOrCreateToken() server-side; if the
      // generated token is brand new the server has no way to convey that
      // without a dedicated route. We use a simpler heuristic: ask
      // /api/auth/setup-check which we do not have, so instead we POST login
      // with a special payload to see if a token was just created.
      //
      // Practical approach: we always show login mode. If the user has no
      // token yet, they can click "First time setup?" to reveal the
      // auto-generated token via an authenticated fetch (which bootstraps
      // itself on first call server-side).
      setLoading(false);
    };
    init();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = token.trim();
    if (!trimmed) {
      setError("Enter your API token.");
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: trimmed }),
      });

      if (res.ok) {
        startTransition(() => {
          router.replace("/");
        });
        return;
      }

      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Invalid token. Check your credentials and try again.");
    } catch {
      setError("Could not reach the API server. Make sure it is running on port 3001.");
    }
  };

  const handleRevealSetupToken = async () => {
    setError(null);
    try {
      // First, log in with the auto-generated token (which may be unknown to
      // the user). Since we can't read it client-side without being auth'd,
      // we ask the user to open the server logs for the generated token.
      // The setup mode simply shows instructions and the current token after
      // the user provides it — or we can do a bootstrap fetch.
      //
      // Better UX: call a special endpoint that returns the token only when
      // no session exists yet AND the credentials file has a fresh token.
      // We approximate this by attempting /api/auth/token with no auth — it
      // will 401. We then surface instructions to the user.
      //
      // Actually the cleanest approach for first-run: the server logs the
      // token on startup. Here we show the instructions panel.
      setMode("setup");
      setSetupToken(null);
    } catch {
      setError("Could not switch to setup mode.");
    }
  };

  const handleSetupReveal = async () => {
    setError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Paste the token from your server startup logs first.");
      return;
    }
    // Try to log in with whatever the user pasted; if it works we also fetch
    // the canonical token to display back to them.
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Token mismatch. Check the server logs.");
        return;
      }

      // Fetch the canonical token for display
      const tokenRes = await fetch("/api/auth/token", { credentials: "include" });
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        setSetupToken(data.token);
      }
    } catch {
      setError("Could not reach the API server.");
    }
  };

  const handleCopy = async () => {
    if (!setupToken) return;
    try {
      await navigator.clipboard.writeText(setupToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <svg
              className="w-6 h-6 text-indigo-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Diffract</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === "login"
              ? "Enter your API token to access the control plane"
              : "First time setup — save your generated token"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="token-input"
                  className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
                >
                  API Token
                </label>
                <input
                  id="token-input"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your API token"
                  autoComplete="current-password"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors font-mono"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                {isPending ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Setup mode — token reveal */}
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-3 text-xs text-zinc-400 space-y-1.5">
                <p className="font-medium text-zinc-300">How to find your token</p>
                <p>
                  On first run, Diffract auto-generates a token and saves it to{" "}
                  <code className="font-mono text-indigo-400">~/.diffract/credentials.json</code>{" "}
                  under the key <code className="font-mono text-indigo-400">DIFFRACT_API_TOKEN</code>.
                </p>
                <p>
                  Paste it below to log in and display it here for safekeeping.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="setup-token-input"
                  className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
                >
                  Token from credentials file
                </label>
                <input
                  id="setup-token-input"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from credentials.json"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors font-mono"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}

              {setupToken ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Your token (save this somewhere safe):</p>
                  <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
                    <code className="flex-1 text-xs text-emerald-400 font-mono break-all">
                      {setupToken}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="shrink-0 text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        router.replace("/");
                      });
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                  >
                    Continue to dashboard
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSetupReveal}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                >
                  Verify and show token
                </button>
              )}
            </div>
          )}
        </div>

        {/* Toggle between login and setup */}
        <div className="text-center mt-4">
          {mode === "login" ? (
            <button
              type="button"
              onClick={handleRevealSetupToken}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              First time setup?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setToken("");
                setSetupToken(null);
              }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
