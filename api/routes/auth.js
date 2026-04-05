// auth.js — Authentication routes
// GET  /api/auth/status  — returns { setupRequired: boolean }
// POST /api/auth/setup   — create admin account (first-visit only)
// POST /api/auth/login   — validate username/password, set session cookie
// GET  /api/auth/me      — return auth status
// POST /api/auth/logout  — clear session cookie

import { Router } from "express";
import {
  isSetupRequired,
  createAdminUser,
  verifyAdminUser,
  createSession,
  destroySession,
  requireAuth,
} from "../lib/auth.js";

const router = Router();

const COOKIE_NAME = "diffract_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// --- GET /api/auth/status ---
// Public. Returns { setupRequired: true } when no admin account exists yet.
router.get("/status", (_req, res) => {
  res.json({ setupRequired: isSetupRequired() });
});

// --- POST /api/auth/setup ---
// Body: { username: string, password: string }
// Creates the initial admin account. Returns 409 if one already exists.
router.post("/setup", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || typeof username !== "string" || username.trim().length === 0) {
    return res.status(400).json({ error: "username is required" });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  if (!isSetupRequired()) {
    return res.status(409).json({ error: "Admin account already exists" });
  }

  try {
    await createAdminUser(username.trim(), password);

    // Automatically log in after setup
    const sessionToken = createSession(username.trim());
    res.cookie(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POST /api/auth/login ---
// Body: { username: string, password: string }
// Validates credentials and sets a session cookie on success.
router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "username is required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password is required" });
  }

  const valid = await verifyAdminUser(username.trim(), password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const sessionToken = createSession(username.trim());
  res.cookie(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
  });
  res.json({ ok: true });
});

// --- GET /api/auth/me ---
// Returns { authenticated: true } if a valid session cookie is present, 401 otherwise.
router.get("/me", (req, res) => {
  requireAuth(req, res, () => {
    res.json({ authenticated: true });
  });
});

// --- POST /api/auth/logout ---
// Destroys the session and clears the cookie.
router.post("/logout", (req, res) => {
  // Extract session token from cookie to destroy it server-side
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name.trim() === COOKIE_NAME) {
        destroySession(rest.join("=").trim());
        break;
      }
    }
  }
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
  res.json({ ok: true });
});

export default router;
