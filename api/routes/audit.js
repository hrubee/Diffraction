// audit.js — Audit log viewer
// Combines policy revision history (via gRPC) with an in-memory API request log.

import { Router } from "express";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// ---- In-memory audit buffer ----
// Exported so auth middleware can append entries without a circular import.
// Capped at MAX_ENTRIES to prevent unbounded memory growth.

const MAX_ENTRIES = 500;

/** @type {Array<AuditEvent>} */
export const auditBuffer = [];

/**
 * Append an API request event to the in-memory buffer.
 * Called by the auth middleware on every authenticated request.
 *
 * @param {{ method: string, path: string, status: number, authenticated: boolean }} entry
 */
export function recordApiRequest({ method, path, status, authenticated }) {
  const event = {
    timestamp: new Date().toISOString(),
    type: "api_request",
    sandbox: null,
    details: `${method} ${path} → ${status}`,
    method,
    path,
    status,
    authenticated,
  };
  auditBuffer.unshift(event); // newest first
  if (auditBuffer.length > MAX_ENTRIES) {
    auditBuffer.length = MAX_ENTRIES;
  }
}

// ---- Route ----

/**
 * GET /api/audit
 *
 * Query params:
 *   sandbox  — filter by sandbox name (optional)
 *   type     — "policy" | "api_request" | "" (all)
 *   limit    — max events to return (default 50)
 *   offset   — pagination offset (default 0)
 */
router.get("/", async (req, res) => {
  try {
    const sandboxFilter = (req.query.sandbox ?? "").trim();
    const typeFilter = (req.query.type ?? "").trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const events = [];

    // 1. Policy history from gRPC
    if (!typeFilter || typeFilter === "policy") {
      // Collect sandboxes to query
      let sandboxNames = [];
      try {
        const listData = await grpcCall("ListSandboxes", { limit: 100, offset: 0 });
        sandboxNames = (listData.sandboxes || []).map((s) => s.name);
      } catch {
        // gRPC unavailable — skip policy events
      }

      if (sandboxFilter) {
        sandboxNames = sandboxNames.filter((n) => n === sandboxFilter);
      }

      for (const name of sandboxNames) {
        try {
          const policyData = await grpcCall("ListSandboxPolicies", { name });
          const revisions = policyData.policies || policyData.revisions || [];
          for (let i = 0; i < revisions.length; i++) {
            const rev = revisions[i];
            const prev = revisions[i + 1];
            const fromVer = prev ? `v${prev.version}` : "initial";
            const toVer = `v${rev.version}`;
            events.push({
              timestamp: rev.created_at_ms
                ? new Date(Number(rev.created_at_ms)).toISOString()
                : new Date().toISOString(),
              type: "policy_update",
              sandbox: name,
              details: `${fromVer} → ${toVer}`,
              version: rev.version,
              status: rev.status,
            });
          }
        } catch {
          // skip this sandbox if policy list fails
        }
      }
    }

    // 2. API request log from in-memory buffer
    if (!typeFilter || typeFilter === "api_request") {
      let apiEvents = auditBuffer;
      if (sandboxFilter) {
        // Best-effort: match sandbox name in the path
        apiEvents = apiEvents.filter((e) => e.path?.includes(sandboxFilter));
      }
      events.push(...apiEvents);
    }

    // Sort all events newest-first
    events.sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      return tb < ta ? -1 : tb > ta ? 1 : 0;
    });

    const total = events.length;
    const page = events.slice(offset, offset + limit);

    res.json({ events: page, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
