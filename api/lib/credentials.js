// api/lib/credentials.js — ESM helper for ~/.diffract/credentials.json
// Mirrors cli/bin/lib/credentials.js shape but as pure ESM (no CJS require).
// API keys never leave the server host — mode 0600 file, dir 0700.

import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const CREDS_DIR = path.join(homedir(), ".diffract");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");

export function loadCredentials() {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8"));
    }
  } catch { /* ignore parse errors */ }
  return {};
}

/**
 * Persist a single credential key, merging with existing file contents.
 * @param {string} key   Credential name (e.g. NVIDIA_API_KEY)
 * @param {string} value Secret value
 */
export function saveCredential(key, value) {
  fs.mkdirSync(CREDS_DIR, { recursive: true, mode: 0o700 });
  const creds = loadCredentials();
  creds[key] = value;
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

/**
 * Read a credential — env var takes precedence over file.
 * @param {string} key
 * @returns {string|null}
 */
export function getCredential(key) {
  if (process.env[key]) return process.env[key];
  const creds = loadCredentials();
  return creds[key] ?? null;
}
