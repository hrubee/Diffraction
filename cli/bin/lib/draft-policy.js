// Draft policy management — calls the OpenShell gateway gRPC to manage
// draft policy chunks (pending approvals from blocked agent requests).
//
// The gateway speaks gRPC over mTLS at the endpoint stored in
// ~/.config/openshell/gateways/<name>/metadata.json with certs in mtls/.

"use strict";

const fs = require("fs");
const path = require("path");
const { PROJECT_ROOT } = require("./runner");

// ── gRPC client setup ───────────────────────────────────────────────────

let _grpcClient = null;
let _serviceDef = null;

function getGatewayConfig() {
  const configBase = path.join(
    process.env.HOME || "/root",
    ".config",
    "openshell",
    "gateways"
  );
  if (!fs.existsSync(configBase)) return null;

  // Find active gateway or first available
  const activeFile = path.join(configBase, "..", "active_gateway");
  let gatewayName = "diffract";
  if (fs.existsSync(activeFile)) {
    gatewayName = fs.readFileSync(activeFile, "utf-8").trim();
  }

  const gatewayDir = path.join(configBase, gatewayName);
  const metaFile = path.join(gatewayDir, "metadata.json");
  if (!fs.existsSync(metaFile)) {
    // Try any gateway directory
    const dirs = fs.readdirSync(configBase).filter((d) =>
      fs.existsSync(path.join(configBase, d, "metadata.json"))
    );
    if (dirs.length === 0) return null;
    return {
      dir: path.join(configBase, dirs[0]),
      meta: JSON.parse(
        fs.readFileSync(path.join(configBase, dirs[0], "metadata.json"), "utf-8")
      ),
    };
  }

  return {
    dir: gatewayDir,
    meta: JSON.parse(fs.readFileSync(metaFile, "utf-8")),
  };
}

function getGrpcClient() {
  if (_grpcClient) return { client: _grpcClient, svc: _serviceDef };

  const grpc = require("@grpc/grpc-js");
  const protoLoader = require("@grpc/proto-loader");

  const config = getGatewayConfig();
  if (!config) throw new Error("No OpenShell gateway configured");

  // Load proto
  const protoDir = path.join(PROJECT_ROOT, "proto");
  const protoFile = path.join(protoDir, "diffract.proto");
  if (!fs.existsSync(protoFile)) {
    throw new Error(`Proto file not found: ${protoFile}`);
  }

  const packageDef = protoLoader.loadSync(protoFile, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [protoDir],
  });
  const proto = grpc.loadPackageDefinition(packageDef);
  _serviceDef = proto.diffract.v1.Diffract.service;

  // Load mTLS certs
  const certDir = path.join(config.dir, "mtls");
  const tlsCreds = grpc.credentials.createSsl(
    fs.readFileSync(path.join(certDir, "ca.crt")),
    fs.readFileSync(path.join(certDir, "tls.key")),
    fs.readFileSync(path.join(certDir, "tls.crt"))
  );

  // Parse gateway endpoint
  const endpoint = config.meta.gateway_endpoint || "https://127.0.0.1:8080";
  const url = new URL(endpoint);
  const host = `${url.hostname}:${url.port || "8080"}`;

  _grpcClient = new grpc.Client(host, tlsCreds, {});
  return { client: _grpcClient, svc: _serviceDef };
}

// The server registers as openshell.v1.OpenShell, but our proto package is
// diffract.v1.Diffract. We call with the server's actual path.
const SERVICE_PREFIX = "/openshell.v1.OpenShell";

function grpcCall(method, request) {
  return new Promise((resolve, reject) => {
    const { client, svc } = getGrpcClient();
    const def = svc[method];
    if (!def) {
      reject(new Error(`Unknown gRPC method: ${method}`));
      return;
    }
    const serialized = def.requestSerialize(request);

    client.makeUnaryRequest(
      `${SERVICE_PREFIX}/${method}`,
      (x) => x,
      def.responseDeserialize,
      serialized,
      { deadline: Date.now() + 10_000 },
      (err, res) => {
        if (err) reject(new Error(`gRPC ${method}: ${err.details || err.message}`));
        else resolve(res);
      }
    );
  });
}

// ── Public API ──────────────────────────────────────────────────────────

async function getDraftChunks(sandboxName, statusFilter = "") {
  try {
    const data = await grpcCall("GetDraftPolicy", {
      name: sandboxName,
      status_filter: statusFilter,
    });
    const chunks = (data.chunks || []).map(normalizeChunk);
    return {
      chunks,
      draftVersion: data.draft_version || 0,
      pendingCount: chunks.filter((c) => c.status === "pending").length,
      lastAnalyzedAtMs: data.last_analyzed_at_ms || 0,
    };
  } catch (err) {
    if (
      err.message.includes("ECONNREFUSED") ||
      err.message.includes("UNAVAILABLE")
    ) {
      return { chunks: [], draftVersion: 0, pendingCount: 0, lastAnalyzedAtMs: 0 };
    }
    throw err;
  }
}

async function approveChunk(sandboxName, chunkId) {
  const data = await grpcCall("ApproveDraftChunk", {
    name: sandboxName,
    chunk_id: chunkId,
  });

  // Save as persistent preset (best-effort)
  try {
    const draftData = await getDraftChunks(sandboxName);
    const chunk = draftData.chunks.find((c) => c.id === chunkId);
    if (chunk && chunk.proposedRule) {
      saveAsPreset(chunk);
    }
  } catch {}

  return {
    policyVersion: data.policy_version || 0,
    policyHash: data.policy_hash || "",
  };
}

async function rejectChunk(sandboxName, chunkId, reason = "") {
  await grpcCall("RejectDraftChunk", {
    name: sandboxName,
    chunk_id: chunkId,
    reason,
  });
}

async function approveAll(sandboxName, includeSecurityFlagged = false) {
  const data = await grpcCall("ApproveAllDraftChunks", {
    name: sandboxName,
    include_security_flagged: includeSecurityFlagged,
  });
  return {
    policyVersion: data.policy_version || 0,
    chunksApproved: data.chunks_approved || 0,
    chunksSkipped: data.chunks_skipped || 0,
  };
}

async function undoChunk(sandboxName, chunkId) {
  const data = await grpcCall("UndoDraftChunk", {
    name: sandboxName,
    chunk_id: chunkId,
  });
  return { policyVersion: data.policy_version || 0 };
}

// ── Persistent preset generation ────────────────────────────────────────

function saveAsPreset(chunk) {
  const presetsDir = path.join(PROJECT_ROOT, "policies", "presets");
  if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

  const safeName = chunk.ruleName.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const presetPath = path.join(presetsDir, `approved-${safeName}.yaml`);
  if (fs.existsSync(presetPath)) return;

  const rule = chunk.proposedRule;
  if (!rule || !rule.endpoints || rule.endpoints.length === 0) return;

  let yaml = `# Auto-generated from approved draft policy chunk\n`;
  yaml += `# Approved: ${new Date().toISOString()}\n\n`;
  yaml += `preset:\n`;
  yaml += `  name: ${safeName}\n`;
  yaml += `  description: "Auto-approved access to ${chunk.host || safeName}"\n\n`;
  yaml += `network_policies:\n`;
  yaml += `  ${safeName}:\n`;
  yaml += `    name: ${safeName}\n`;
  yaml += `    endpoints:\n`;

  for (const ep of rule.endpoints) {
    yaml += `      - host: ${ep.host}\n`;
    yaml += `        port: ${ep.port || 443}\n`;
    yaml += `        protocol: rest\n`;
    yaml += `        enforcement: enforce\n`;
    yaml += `        tls: terminate\n`;
    yaml += `        rules:\n`;
    yaml += `          - allow: { method: GET, path: "/**" }\n`;
    yaml += `          - allow: { method: POST, path: "/**" }\n`;
  }

  fs.writeFileSync(presetPath, yaml, "utf-8");
}

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizeChunk(raw) {
  const rule = raw.proposed_rule || {};
  const endpoints = rule.endpoints || [];
  const firstEndpoint = endpoints[0] || {};

  return {
    id: raw.id || "",
    status: raw.status || "pending",
    ruleName: raw.rule_name || "",
    host: firstEndpoint.host || "",
    port: firstEndpoint.port || 443,
    binary: raw.binary || "",
    rationale: raw.rationale || "",
    securityNotes: raw.security_notes || "",
    confidence: raw.confidence || 0,
    hitCount: raw.hit_count || 0,
    createdAtMs: raw.created_at_ms || 0,
    decidedAtMs: raw.decided_at_ms || 0,
    stage: raw.stage || "initial",
    proposedRule: rule,
    endpoints: endpoints.map((ep) => ({
      host: ep.host || "",
      port: ep.port || 443,
    })),
  };
}

module.exports = {
  getDraftChunks,
  approveChunk,
  rejectChunk,
  approveAll,
  undoChunk,
  saveAsPreset,
};
