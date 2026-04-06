import { Router } from "express";
import { grpcCall, grpcStream } from "../lib/grpc-client.js";

const router = Router();

// Resolve sandbox name → UUID
async function getSandboxId(name) {
  const data = await grpcCall("GetSandbox", { name });
  const sandbox = data.sandbox || data;
  if (!sandbox?.id) throw new Error(`Sandbox '${name}' not found`);
  return sandbox.id;
}

// Normalize SandboxLogLine from proto to a consistent shape for the UI.
// Mirrors what diffract-tui renders: timestamp, source, level, target, message, fields.
function normalizeLine(line) {
  return {
    timestamp: line.timestamp_ms
      ? new Date(Number(line.timestamp_ms)).toISOString()
      : "",
    level: line.level || "",
    // source is "gateway" or "sandbox"; fall back to "" (TUI treats "" as "gateway")
    source: line.source || "",
    // target is the Rust module path shown after source in TUI detail view
    target: line.target || "",
    message: line.message || "",
    // structured key-value fields (e.g. dst_host, action) — kept as-is for UI rendering
    fields: line.fields && typeof line.fields === "object" ? line.fields : {},
  };
}

// GET /api/sandboxes/:name/logs — fetch recent logs (one-shot)
router.get("/:name/logs", async (req, res) => {
  try {
    const sandboxId = await getSandboxId(req.params.name);
    const lines = parseInt(req.query.lines) || 200;
    const sinceMs = parseInt(req.query.since_ms) || 0;
    const sources = req.query.sources
      ? req.query.sources.split(",")
      : [];
    const data = await grpcCall("GetSandboxLogs", {
      sandbox_id: sandboxId,
      lines,
      since_ms: sinceMs,
      sources,
      min_level: req.query.min_level || "",
    });
    const entries = (data.logs || []).map(normalizeLine);
    res.json({ entries, buffer_total: data.buffer_total || 0 });
  } catch (err) {
    if (err.message.includes("UNAVAILABLE")) {
      res.json({ entries: [], buffer_total: 0 });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// GET /api/sandboxes/:name/watch — SSE stream of sandbox events
router.get("/:name/watch", async (req, res) => {
  let sandboxId;
  try {
    sandboxId = await getSandboxId(req.params.name);
  } catch (err) {
    res.status(404).json({ error: err.message });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Replay N recent log lines so the UI picks up history it may have missed
  // between an initial one-shot fetch and opening the stream.
  // The client passes since_ms to skip lines already shown.
  const logSinceMs = parseInt(req.query.since_ms) || 0;
  const logTailLines = logSinceMs > 0 ? 0 : 50;

  let stream;
  try {
    stream = grpcStream("WatchSandbox", {
      id: sandboxId,
      follow_status: true,
      follow_logs: true,
      follow_events: true,
      log_tail_lines: logTailLines,
      log_since_ms: logSinceMs,
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
    return;
  }

  stream.on("data", (event) => {
    // Normalize the event for the UI
    const normalized = {};
    if (event.log) {
      normalized.log_entry = normalizeLine(event.log);
    }
    if (event.sandbox) {
      normalized.sandbox = event.sandbox;
    }
    if (event.event) {
      normalized.platform_event = event.event;
    }
    if (event.draft_policy_update) {
      normalized.draft_policy_update = event.draft_policy_update;
    }
    res.write(`data: ${JSON.stringify(normalized)}\n\n`);
  });

  stream.on("error", (err) => {
    res.write(
      `data: ${JSON.stringify({ error: err.details || err.message })}\n\n`
    );
    res.end();
  });

  stream.on("end", () => {
    res.end();
  });

  req.on("close", () => {
    stream.cancel();
  });
});

export default router;
