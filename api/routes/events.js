// api/routes/events.js — SSE stream for onboard job events.
//
// GET /api/events?sandbox=<name>
//   Streams structured step events for the onboard job associated with
//   the given sandbox name.  Replaces the 3s polling loop in the UI.
//
// Event format (sent as SSE "data" lines, one JSON object per event):
//   { id: <rowid>, job_id, step, status, ts, error? }
//
// Terminal events (status="job_done" or "job_failed") signal that the
// stream is finished; the client should close the EventSource.

import { Router } from "express";
import { getJobBySandbox, getJobEventsSince } from "../lib/jobs.js";

const router = Router();
const POLL_INTERVAL_MS = 500;

router.get("/", (req, res) => {
  const sandboxName = req.query.sandbox;
  if (!sandboxName || typeof sandboxName !== "string") {
    res.status(400).json({ error: "sandbox query param required" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  // Look up the job
  const job = getJobBySandbox(sandboxName);
  if (!job) {
    // No job yet — send a synthetic "waiting" event and close
    res.write(`data: ${JSON.stringify({ type: "no_job", sandbox: sandboxName })}\n\n`);
    res.end();
    return;
  }

  // Send the job row as the first event so the client knows current status
  res.write(`data: ${JSON.stringify({ type: "job_state", job })}\n\n`);

  // If already terminal, flush history and close
  if (job.status === "done" || job.status === "failed") {
    const events = getJobEventsSince(job.id, 0);
    for (const ev of events) {
      res.write(`data: ${JSON.stringify({ type: "step_event", ...ev })}\n\n`);
    }
    res.end();
    return;
  }

  // Stream new events via polling
  let lastId = 0;
  let timer = null;
  let closed = false;

  function poll() {
    if (closed) return;
    try {
      const events = getJobEventsSince(job.id, lastId);
      for (const ev of events) {
        res.write(`data: ${JSON.stringify({ type: "step_event", ...ev })}\n\n`);
        lastId = ev.id;
      }

      // Re-fetch job to detect terminal state
      const current = getJobBySandbox(sandboxName);
      if (current && (current.status === "done" || current.status === "failed")) {
        // Flush any remaining events
        const tail = getJobEventsSince(job.id, lastId);
        for (const ev of tail) {
          res.write(`data: ${JSON.stringify({ type: "step_event", ...ev })}\n\n`);
        }
        res.write(
          `data: ${JSON.stringify({ type: "job_done", status: current.status, exit_code: current.exit_code, finished_at: current.finished_at })}\n\n`
        );
        res.end();
        closed = true;
        return;
      }
    } catch (err) {
      // DB error — don't crash the server; just log and keep polling
      console.error("[events] poll error:", err.message);
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  req.on("close", () => {
    closed = true;
    if (timer) clearTimeout(timer);
  });

  // Start polling after a short delay so initial job_state event lands first
  timer = setTimeout(poll, POLL_INTERVAL_MS);
});

export default router;
