// auth.js — API authentication middleware (username/password + session cookies)
// Admin credentials stored as bcrypt hash in ~/.diffract/credentials.json (mode 600).
// Sessions are kept in-memory; a fresh API restart requires re-login.

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import bcrypt from "bcryptjs";

const CREDENTIALS_PATH = path.join(os.homedir(), ".diffract", "credentials.json");
const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = "diffract_session";

// In-memory session store: sessionToken → { username, createdAt }
const sessions = new Map();

// --- Credentials helpers ---

function readCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    }
  } catch {
    // corrupted or missing — start fresh
  }
  return {};
}

function writeCredentials(data) {
  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Parse the diffract_session cookie value from a raw Cookie header string.
 *
 * @param {string | undefined} cookieHeader
 * @returns {string | null}
 */
function extractSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.trim() === COOKIE_NAME) {
      return rest.join("=").trim();
    }
  }
  return null;
}

/**
 * Returns true if no admin account has been created yet.
 * This drives the first-visit setup flow.
 *
 * @returns {boolean}
 */
export function isSetupRequired() {
  const creds = readCredentials();
  return !creds.admin_username || !creds.admin_password_hash;
}

/**
 * Create the initial admin account. Only succeeds when setup is required.
 * Throws if an admin already exists.
 *
 * @param {string} username
 * @param {string} password
 */
export async function createAdminUser(username, password) {
  if (!isSetupRequired()) {
    throw new Error("Admin account already exists");
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const creds = readCredentials();
  creds.admin_username = username;
  creds.admin_password_hash = hash;
  writeCredentials(creds);
}

/**
 * Verify username + password against stored bcrypt hash.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyAdminUser(username, password) {
  const creds = readCredentials();
  if (!creds.admin_username || !creds.admin_password_hash) return false;
  if (creds.admin_username !== username) return false;
  return bcrypt.compare(password, creds.admin_password_hash);
}

/**
 * Create a new session token, store it in the in-memory sessions map.
 *
 * @param {string} username
 * @returns {string} sessionToken
 */
export function createSession(username) {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionToken, { username, createdAt: Date.now() });
  return sessionToken;
}

/**
 * Destroy a session by token.
 *
 * @param {string} sessionToken
 */
export function destroySession(sessionToken) {
  sessions.delete(sessionToken);
}

/**
 * Express middleware that enforces authentication on every request it wraps.
 * Accepts a diffract_session cookie set by POST /api/auth/login.
 * Returns 401 { error: "Unauthorized" } if no valid session is found.
 *
 * @type {import("express").RequestHandler}
 */
export function requireAuth(req, res, next) {
  const cookieValue = extractSessionCookie(req.headers["cookie"]);
  if (cookieValue && sessions.has(cookieValue)) {
    _recordAfterResponse(req, res, true);
    return next();
  }

  _recordAfterResponse(req, res, false);
  res.status(401).json({ error: "Unauthorized" });
}

/**
 * Hook into the response finish event so we can record the final status code.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 * @param {boolean} authenticated
 */
function _recordAfterResponse(req, res, authenticated) {
  res.on("finish", () => {
    import("../routes/audit.js")
      .then(({ recordApiRequest }) => {
        recordApiRequest({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          authenticated,
        });
      })
      .catch(() => {
        // Audit recording is best-effort — never let it crash the server
      });
  });
}
