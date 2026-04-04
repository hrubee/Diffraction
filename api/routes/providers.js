import { Router } from "express";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// GET /api/providers
router.get("/", async (_req, res) => {
  try {
    const data = await grpcCall("ListProviders", {});
    res.json({ providers: data.providers || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers/:name
router.get("/:name", async (req, res) => {
  try {
    const data = await grpcCall("GetProvider", { name: req.params.name });
    res.json(data.provider || null);
  } catch (err) {
    if (err.message.includes("NOT_FOUND")) {
      res.status(404).json({ error: `Provider '${req.params.name}' not found` });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/providers
router.post("/", async (req, res) => {
  try {
    const data = await grpcCall("CreateProvider", req.body);
    res.status(201).json(data.provider || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/providers/:name
router.put("/:name", async (req, res) => {
  try {
    const data = await grpcCall("UpdateProvider", {
      name: req.params.name,
      ...req.body,
    });
    res.json(data.provider || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/providers/:name
router.delete("/:name", async (req, res) => {
  try {
    const data = await grpcCall("DeleteProvider", { name: req.params.name });
    res.json({ deleted: data.deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
