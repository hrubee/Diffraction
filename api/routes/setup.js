// api/routes/setup.js — First-run admin account creation (no auth required)
//
// POST /api/setup  { username, password }
//   Validates inputs, creates the admin account, writes the credentials marker
//   file so GET /api/status returns hasCredentials:true, then auto-logs in.
//   Returns 409 if setup was already completed.

import fs from "fs";
import path from "path";
import { Router } from "express";
import {
  isSetupRequired,
  createAdminUser,
  createSession,
} from "../lib/auth.js";

const CREDS_PATH =
  process.env.DIFFRACT_UI_CREDS_PATH || "/opt/diffract-ui/.credentials.json";

const COOKIE_NAME = "diffract_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function writeMarkerFile() {
  try {
    const dir = path.dirname(CREDS_PATH);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(CREDS_PATH)) {
      fs.writeFileSync(CREDS_PATH, JSON.stringify({ setup: true }), {
        encoding: "utf8",
        mode: 0o600,
      });
    }
  } catch {
    // Best-effort — don't fail setup if the opt path isn't writable (dev env)
  }
}

const router = Router();

// POST /api/setup — { username: string, password: string }
router.post("/", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "username is required" });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  if (!isSetupRequired()) {
    return res.status(409).json({ error: "Setup already completed" });
  }

  try {
    await createAdminUser(username.trim(), password);
    writeMarkerFile();

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

export default router;
