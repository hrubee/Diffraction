// auth.js — Authentication routes
// POST /api/auth/login   — validate token, set session cookie
// GET  /api/auth/me      — return auth status
// POST /api/auth/logout  — clear session cookie
// GET  /api/auth/token   — return the API token (requires valid session)

import { Router } from "express";
import { getOrCreateToken, requireAuth } from "../lib/auth.js";

const router = Router();

const COOKIE_NAME = "diffract_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// --- POST /api/auth/login ---
// Body: { token: string }
// Validates against the stored/generated DIFFRACT_API_TOKEN.
// On success: sets httpOnly session cookie and returns { ok: true }.
router.post("/login", (req, res) => {
  const { token: candidate } = req.body ?? {};
  if (!candidate || typeof candidate !== "string") {
    return res.status(400).json({ error: "token is required" });
  }

  const { token } = getOrCreateToken();
  if (candidate.trim() !== token) {
    return res.status(401).json({ error: "Invalid token" });
  }

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
  });

  res.json({ ok: true });
});

// --- GET /api/auth/me ---
// Returns { authenticated: true } if a valid Bearer token or session cookie
// is present, 401 otherwise. Uses requireAuth directly so no duplication.
router.get("/me", (req, res, next) => {
  // Delegate to requireAuth — if it calls next(), we respond 200.
  requireAuth(req, res, () => {
    res.json({ authenticated: true });
  });
});

// --- POST /api/auth/logout ---
// Clears the session cookie. No auth required — logging out is always safe.
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
  res.json({ ok: true });
});

// --- GET /api/auth/token ---
// Returns the current API token. Protected — only accessible when already
// authenticated. Useful for the first-time setup flow in the UI.
router.get("/token", requireAuth, (_req, res) => {
  const { token, isNew } = getOrCreateToken();
  res.json({ token, isNew });
});

export default router;
