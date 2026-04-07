// api/lib/jobs.js — SQLite-backed onboard job store.
// Replaces the in-memory activeOnboards Map in routes/sandboxes.js.
//
// Schema
//   jobs(id TEXT PK, sandbox_name TEXT, status TEXT, started_at INTEGER,
//        finished_at INTEGER, exit_code INTEGER, log_path TEXT)
//   job_events(id INTEGER PK AUTOINCREMENT, job_id TEXT, step TEXT,
//              status TEXT, ts TEXT, error TEXT)
//
// Uses the built-in node:sqlite (Node >= 22.5) — no extra dependencies.

import { DatabaseSync } from "node:sqlite";
import { homedir } from "os";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const DB_PATH = join(homedir(), ".diffract", "jobs.db");

/** @type {DatabaseSync | null} */
let _db = null;

function db() {
  if (_db) return _db;
  mkdirSync(join(homedir(), ".diffract"), { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  // WAL mode for concurrent readers
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT PRIMARY KEY,
      sandbox_name TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      started_at   INTEGER,
      finished_at  INTEGER,
      exit_code    INTEGER,
      log_path     TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_sandbox ON jobs(sandbox_name);

    CREATE TABLE IF NOT EXISTS job_events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id  TEXT    NOT NULL,
      step    TEXT    NOT NULL,
      status  TEXT    NOT NULL,
      ts      TEXT    NOT NULL,
      error   TEXT
    );
    CREATE INDEX IF NOT EXISTS job_events_job ON job_events(job_id);
  `);
  return _db;
}

/**
 * Create a new job row in 'queued' state.
 * @param {string} sandboxName
 * @param {string} logPath
 * @returns {string} jobId
 */
export function createJob(sandboxName, logPath) {
  const id = randomUUID();
  db()
    .prepare(
      "INSERT INTO jobs (id, sandbox_name, status, started_at, log_path) VALUES (?, ?, 'queued', ?, ?)"
    )
    .run(id, sandboxName, Date.now(), logPath);
  return id;
}

/**
 * Update job status (and optionally exit_code / finished_at).
 * @param {string} jobId
 * @param {'queued'|'running'|'done'|'failed'} status
 * @param {number|null} [exitCode]
 */
export function updateJobStatus(jobId, status, exitCode = null) {
  const finished = status === "done" || status === "failed" ? Date.now() : null;
  db()
    .prepare(
      "UPDATE jobs SET status=?, exit_code=?, finished_at=? WHERE id=?"
    )
    .run(status, exitCode, finished, jobId);
}

/**
 * Append a step lifecycle event.
 * @param {string} jobId
 * @param {{ step: string, status: string, ts: string, error?: string }} event
 */
export function appendEvent(jobId, event) {
  db()
    .prepare(
      "INSERT INTO job_events (job_id, step, status, ts, error) VALUES (?, ?, ?, ?, ?)"
    )
    .run(jobId, event.step, event.status, event.ts, event.error ?? null);
}

/**
 * Get the most recent job for a sandbox (any status).
 * @param {string} sandboxName
 * @returns {object|null}
 */
export function getJobBySandbox(sandboxName) {
  return (
    db()
      .prepare(
        "SELECT * FROM jobs WHERE sandbox_name=? ORDER BY started_at DESC LIMIT 1"
      )
      .get(sandboxName) ?? null
  );
}

/**
 * Get job by ID.
 * @param {string} jobId
 * @returns {object|null}
 */
export function getJobById(jobId) {
  return db().prepare("SELECT * FROM jobs WHERE id=?").get(jobId) ?? null;
}

/**
 * Get events for a job, optionally after a given rowid.
 * @param {string} jobId
 * @param {number} [afterId=0]
 * @returns {Array<object>}
 */
export function getJobEventsSince(jobId, afterId = 0) {
  return db()
    .prepare(
      "SELECT * FROM job_events WHERE job_id=? AND id>? ORDER BY id ASC"
    )
    .all(jobId, afterId);
}

/**
 * Returns true if a job for this sandbox is currently running.
 * (Worker pool — concurrency=1 per host means we enforce globally.)
 * @param {string} sandboxName
 * @returns {boolean}
 */
export function isJobRunning(sandboxName) {
  const row = db()
    .prepare(
      "SELECT 1 FROM jobs WHERE sandbox_name=? AND status IN ('queued','running') LIMIT 1"
    )
    .get(sandboxName);
  return !!row;
}
