// relay-server.js — Standalone relay service on :9090
// Cross-sandbox message forwarding with policy-checked routing.
// Run alongside the main API bridge (port 3001).

import express from "express";
import cors from "cors";
import relayRoutes from "./routes/relay.js";

const app = express();
const PORT = parseInt(process.env.RELAY_PORT || "9090", 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "diffract-relay", port: PORT });
});

app.use("/relay", relayRoutes);

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[relay]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Diffract relay service listening on :${PORT}`);
});

export default app;
