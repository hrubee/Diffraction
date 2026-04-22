// Diffract REST API Bridge
// Wraps the OpenShell gRPC gateway into HTTP endpoints for the web dashboard.

import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.js";
import sandboxRoutes from "./routes/sandboxes.js";
import logRoutes from "./routes/logs.js";
import providerRoutes from "./routes/providers.js";
import draftPolicyRoutes from "./routes/draft-policy.js";
import configRoutes from "./routes/config.js";
import modelRoutes from "./routes/models.js";
import tokenRoutes from "./routes/token.js";
import activePolicyRoutes from "./routes/active-policy.js";
import gatewayRoutes from "./routes/gateway-routes.js";
import channelRoutes from "./routes/channels.js";
import mcpRoutes from "./routes/mcp.js";
import authRoutes from "./routes/auth.js";
import statusRoutes from "./routes/status.js";
import setupRoutes from "./routes/setup.js";
import skillRoutes from "./routes/skills.js";
import auditRoutes from "./routes/audit.js";
import relayRoutes from "./routes/relay.js";
import eventsRoutes from "./routes/events.js";
import onboardRoutes from "./routes/onboard.js";
import policyPresetRoutes from "./routes/policies.js";
import { requireAuth } from "./lib/auth.js";

const app = express();
const PORT = parseInt(process.env.API_PORT || "3001", 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Auth routes — mounted BEFORE the auth middleware so login/logout are public.
app.use("/api/auth", authRoutes);

// Health check — exempt from auth (used by infrastructure probes).
app.use("/api/health", healthRoutes);

// First-run state + setup — public (no auth required).
app.use("/api/status", statusRoutes);
app.use("/api/setup", setupRoutes);

// Apply auth middleware to all remaining /api/* routes.
app.use("/api", requireAuth);
app.use("/api/sandboxes", sandboxRoutes);
app.use("/api/sandboxes", logRoutes); // /api/sandboxes/:name/logs, /watch
app.use("/api/sandboxes", draftPolicyRoutes); // /api/sandboxes/:name/draft-policy/*
app.use("/api/providers", providerRoutes);
app.use("/api/config", configRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/gateway-token", tokenRoutes);
app.use("/api/sandboxes", activePolicyRoutes); // /api/sandboxes/:name/active-policy
app.use("/api/gateway-routes", gatewayRoutes); // /api/gateway-routes, /sync
app.use("/api/channels", channelRoutes);       // /api/channels, /start, /stop, /config
app.use("/api/mcp", mcpRoutes);               // /api/mcp/zapier, /tools, /sync
app.use("/api/skills", skillRoutes);          // /api/skills, /:name/apply/:sandbox
app.use("/api/audit", auditRoutes);           // /api/audit?sandbox=&type=&limit=&offset=
app.use("/api/relay", relayRoutes);           // /api/relay/routes, /send, /status
app.use("/api/events", eventsRoutes);         // /api/events?sandbox=<name> SSE stream
app.use("/api/onboard", onboardRoutes);       // /api/onboard/start, /status/:jobId
app.use("/api/policies", policyPresetRoutes); // /api/policies/presets

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[api]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Diffract API bridge listening on :${PORT}`);
});

export default app;
