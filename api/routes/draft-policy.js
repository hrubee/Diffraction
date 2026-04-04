import { Router } from "express";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// GET /api/sandboxes/:name/draft-policy — get draft policy chunks
router.get("/:name/draft-policy", async (req, res) => {
  try {
    const statusFilter = req.query.status || "";
    const data = await grpcCall("GetDraftPolicy", {
      name: req.params.name,
      status_filter: statusFilter,
    });
    res.json({
      chunks: data.chunks || [],
      draft_version: data.draft_version || 0,
      last_analyzed_at_ms: data.last_analyzed_at_ms || 0,
    });
  } catch (err) {
    if (err.message.includes("UNAVAILABLE")) {
      res.json({ chunks: [], draft_version: 0, last_analyzed_at_ms: 0 });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/sandboxes/:name/draft-policy/:chunkId/approve
router.post("/:name/draft-policy/:chunkId/approve", async (req, res) => {
  try {
    const data = await grpcCall("ApproveDraftChunk", {
      name: req.params.name,
      chunk_id: req.params.chunkId,
    });
    res.json({
      policy_version: data.policy_version || 0,
      policy_hash: data.policy_hash || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sandboxes/:name/draft-policy/:chunkId/reject
router.post("/:name/draft-policy/:chunkId/reject", async (req, res) => {
  try {
    const reason = req.body.reason || "";
    await grpcCall("RejectDraftChunk", {
      name: req.params.name,
      chunk_id: req.params.chunkId,
      reason,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sandboxes/:name/draft-policy/approve-all
router.post("/:name/draft-policy/approve-all", async (req, res) => {
  try {
    const includeSecurityFlagged = req.body.include_security_flagged || false;
    const data = await grpcCall("ApproveAllDraftChunks", {
      name: req.params.name,
      include_security_flagged: includeSecurityFlagged,
    });
    res.json({
      policy_version: data.policy_version || 0,
      chunks_approved: data.chunks_approved || 0,
      chunks_skipped: data.chunks_skipped || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sandboxes/:name/draft-policy/:chunkId/undo
router.post("/:name/draft-policy/:chunkId/undo", async (req, res) => {
  try {
    const data = await grpcCall("UndoDraftChunk", {
      name: req.params.name,
      chunk_id: req.params.chunkId,
    });
    res.json({ policy_version: data.policy_version || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sandboxes/:name/draft-policy/:chunkId — edit a draft chunk
router.put("/:name/draft-policy/:chunkId", async (req, res) => {
  try {
    const data = await grpcCall("EditDraftChunk", {
      name: req.params.name,
      chunk_id: req.params.chunkId,
      ...req.body,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sandboxes/:name/draft-policy — clear all pending chunks
router.delete("/:name/draft-policy", async (req, res) => {
  try {
    await grpcCall("ClearDraftChunks", { name: req.params.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sandboxes/:name/draft-policy/history
router.get("/:name/draft-policy/history", async (req, res) => {
  try {
    const data = await grpcCall("GetDraftHistory", { name: req.params.name });
    res.json({ entries: data.entries || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
