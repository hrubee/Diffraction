// auth.js — API authentication middleware and token management
// Reads/creates DIFFRACT_API_TOKEN in ~/.diffract/credentials.json
// Validates requests via Authorization: Bearer or diffract_session cookie

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const CREDENTIALS_PATH = path.join(os.homedir(), ".diffract", "credentials.json");

// --- Credentials helpers (mirrors the pattern in routes/mcp.js) ---

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
 * Returns the stored DIFFRACT_API_TOKEN, generating and persisting one if none
 * exists yet. The generated token is 32 hex characters (16 random bytes).
 *
 * @returns {{ token: string, isNew: boolean }}
 */
export function getOrCreateToken() {
  const creds = readCredentials();
  if (creds.DIFFRACT_API_TOKEN) {
    return { token: creds.DIFFRACT_API_TOKEN, isNew: false };
  }
  const token = crypto.randomBytes(16).toString("hex");
  creds.DIFFRACT_API_TOKEN = token;
  writeCredentials(creds);
  return { token, isNew: true };
}

/**
 * Parse the diffract_session cookie value from a raw Cookie header string.
 * We do not depend on cookie-parser — just a targeted substring search.
 *
 * @param {string | undefined} cookieHeader
 * @returns {string | null}
 */
function extractSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.trim() === "diffract_session") {
      return rest.join("=").trim();
    }
  }
  return null;
}

/**
 * Express middleware that enforces authentication on every request it wraps.
 * Accepts either:
 *   - Authorization: Bearer <token>  header
 *   - diffract_session cookie set by POST /api/auth/login
 *
 * Returns 401 { error: "Unauthorized" } if neither is present or valid.
 * On authenticated requests, appends an entry to the audit buffer.
 *
 * @type {import("express").RequestHandler}
 */
export function requireAuth(req, res, next) {
  const { token } = getOrCreateToken();

  // 1. Check Authorization: Bearer header
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const candidate = authHeader.slice(7).trim();
    if (candidate === token) {
      _recordAfterResponse(req, res, true);
      return next();
    }
  }

  // 2. Check diffract_session cookie
  const cookieValue = extractSessionCookie(req.headers["cookie"]);
  if (cookieValue && cookieValue === token) {
    _recordAfterResponse(req, res, true);
    return next();
  }

  // Unauthenticated — record the attempt then reject
  _recordAfterResponse(req, res, false);
  res.status(401).json({ error: "Unauthorized" });
}

/**
 * Hook into the response finish event so we can record the final status code.
 * We import the audit buffer lazily to avoid a circular-import issue at module
 * load time (auth.js → audit.js → grpc-client.js … → nothing that imports auth).
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 * @param {boolean} authenticated
 */
function _recordAfterResponse(req, res, authenticated) {
  res.on("finish", () => {
    // Dynamic import to sidestep circular dependency at startup
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
