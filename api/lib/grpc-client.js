// Generalized gRPC client for the OpenShell gateway.
// Extracted from cli/bin/lib/draft-policy.js and made reusable for the REST bridge.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

// The server registers as openshell.v1.OpenShell, but our proto package is
// diffract.v1.Diffract. We call with the server's actual service path.
const SERVICE_PREFIX = "/openshell.v1.OpenShell";

let _client = null;
let _serviceDef = null;
let _watcher = null;
let _debounceTimer = null;

/**
 * Watch the mTLS cert directory and rebuild the gRPC client when certs change.
 * Debounced 1s to coalesce burst writes during cert rotation.
 */
function startCertWatcher(certDir) {
  if (_watcher) return; // already watching
  try {
    _watcher = fs.watch(certDir, { recursive: false }, (_event, filename) => {
      if (!filename || !["ca.crt", "tls.key", "tls.crt"].includes(filename))
        return;
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        console.log(
          `[grpc-client] cert change detected (${filename}), hot-reloading mTLS credentials`
        );
        if (_client) {
          _client.close();
          _client = null;
          _serviceDef = null;
        }
        // Rebuild eagerly so the next call doesn't pay the latency
        try {
          getGrpcClient();
        } catch (err) {
          console.error("[grpc-client] failed to rebuild client after cert change:", err.message);
        }
      }, 1000);
    });
    _watcher.on("error", (err) => {
      console.error("[grpc-client] cert watcher error:", err.message);
      _watcher = null;
    });
  } catch (err) {
    // Non-fatal: hot-reload unavailable, but client still works
    console.warn("[grpc-client] could not start cert watcher:", err.message);
  }
}

/** Read gateway endpoint + mTLS certs from ~/.config/openshell/gateways/ */
export function getGatewayConfig() {
  const configBase = path.join(
    process.env.HOME || "/root",
    ".config",
    "openshell",
    "gateways"
  );
  if (!fs.existsSync(configBase)) return null;

  const activeFile = path.join(configBase, "..", "active_gateway");
  let gatewayName = "diffract";
  if (fs.existsSync(activeFile)) {
    gatewayName = fs.readFileSync(activeFile, "utf-8").trim();
  }

  const gatewayDir = path.join(configBase, gatewayName);
  const metaFile = path.join(gatewayDir, "metadata.json");
  if (!fs.existsSync(metaFile)) {
    const dirs = fs
      .readdirSync(configBase)
      .filter((d) => fs.existsSync(path.join(configBase, d, "metadata.json")));
    if (dirs.length === 0) return null;
    return {
      dir: path.join(configBase, dirs[0]),
      meta: JSON.parse(
        fs.readFileSync(
          path.join(configBase, dirs[0], "metadata.json"),
          "utf-8"
        )
      ),
    };
  }

  return {
    dir: gatewayDir,
    meta: JSON.parse(fs.readFileSync(metaFile, "utf-8")),
  };
}

/** Build (or reuse) the mTLS-secured gRPC client + service definition. */
export function getGrpcClient() {
  if (_client) return { client: _client, svc: _serviceDef };

  const config = getGatewayConfig();
  if (!config) throw new Error("No OpenShell gateway configured");

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

  const certDir = path.join(config.dir, "mtls");
  const tlsCreds = grpc.credentials.createSsl(
    fs.readFileSync(path.join(certDir, "ca.crt")),
    fs.readFileSync(path.join(certDir, "tls.key")),
    fs.readFileSync(path.join(certDir, "tls.crt"))
  );

  const endpoint = config.meta.gateway_endpoint || "https://127.0.0.1:8080";
  const url = new URL(endpoint);
  const host = `${url.hostname}:${url.port || "8080"}`;

  _client = new grpc.Client(host, tlsCreds, {});
  startCertWatcher(certDir);
  return { client: _client, svc: _serviceDef };
}

/** Make a unary gRPC call and return the response. */
export function grpcCall(method, request = {}, timeoutMs = 10_000) {
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
      { deadline: Date.now() + timeoutMs },
      (err, res) => {
        if (err)
          reject(new Error(`gRPC ${method}: ${err.details || err.message}`));
        else resolve(res);
      }
    );
  });
}

/** Open a server-streaming gRPC call and return the stream. */
export function grpcStream(method, request = {}) {
  const { client, svc } = getGrpcClient();
  const def = svc[method];
  if (!def) throw new Error(`Unknown gRPC method: ${method}`);

  const serialized = def.requestSerialize(request);
  return client.makeServerStreamRequest(
    `${SERVICE_PREFIX}/${method}`,
    (x) => x,
    def.responseDeserialize,
    serialized,
    {}
  );
}

/** Reset the cached client (for reconnection). Stops the cert watcher too. */
export function resetClient() {
  clearTimeout(_debounceTimer);
  _debounceTimer = null;
  if (_watcher) {
    _watcher.close();
    _watcher = null;
  }
  if (_client) {
    _client.close();
    _client = null;
    _serviceDef = null;
  }
}
