import { Router } from "express";
import { execSync } from "node:child_process";
import fs from "node:fs";

const router = Router();

const CADDY_TEMPLATE_PATH = "/root/diffract/deploy/caddy/Caddyfile";
const CADDY_OUTPUT_PATH = "/etc/caddy/Caddyfile";
const DOMAIN = process.env.DIFFRACT_DOMAIN || "srv1534809.hstgr.cloud";

/** Parse `openshell forward list` to get sandbox → port mapping */
function getForwardedPorts() {
  try {
    const output = execSync(
      'export PATH="$PATH:$HOME/.local/bin"; openshell forward list 2>/dev/null',
      { encoding: "utf-8", timeout: 5000 }
    );
    const lines = output.split("\n").filter((l) => l.trim() && !l.startsWith("SANDBOX"));
    return lines.map((line) => {
      // SANDBOX      BIND      PORT     PID        STATUS
      const cols = line.trim().split(/\s+/);
      return {
        name: cols[0],
        bind: cols[1] || "127.0.0.1",
        port: parseInt(cols[2], 10),
        pid: cols[3],
        status: (cols[4] || "").replace(/\x1b\[[0-9;]*m/g, ""),
      };
    }).filter((f) => f.name && f.port && f.status === "running");
  } catch {
    return [];
  }
}

// GET /api/gateway-routes — returns all sandbox gateway routes
router.get("/", (_req, res) => {
  const forwards = getForwardedPorts();
  res.json({
    domain: DOMAIN,
    routes: forwards.map((f) => ({
      sandbox: f.name,
      port: f.port,
      url: `/agent/${f.name}/`,
    })),
  });
});

// GET /api/gateway-routes/:name — returns a single sandbox's gateway route
router.get("/:name", (req, res) => {
  const forwards = getForwardedPorts();
  const match = forwards.find((f) => f.name === req.params.name);
  if (!match) {
    res.status(404).json({ error: `No active gateway for sandbox '${req.params.name}'` });
    return;
  }
  res.json({
    sandbox: match.name,
    port: match.port,
    url: `/agent/${match.name}/`,
  });
});

// POST /api/gateway-routes/sync — regenerate Caddy config from active sandboxes
router.post("/sync", (_req, res) => {
  try {
    const forwards = getForwardedPorts();
    const caddyConfig = generateCaddyfile(forwards);
    fs.writeFileSync(CADDY_OUTPUT_PATH, caddyConfig, "utf-8");
    execSync("systemctl reload caddy 2>&1", { timeout: 5000 });
    res.json({ ok: true, routes: forwards.length, reloaded: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateCaddyfile(forwards) {
  // Per-sandbox agent blocks
  const agentBlocks = forwards.map((f) => `
	# Sandbox: ${f.name} (port ${f.port})
	handle /agent/${f.name}/* {
		uri strip_prefix /agent/${f.name}
		reverse_proxy 127.0.0.1:${f.port} {
			header_up Host 127.0.0.1:${f.port}
			header_up Origin http://127.0.0.1:${f.port}
			header_down -X-Frame-Options
			header_down Content-Security-Policy "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors https://${DOMAIN}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss: https://${DOMAIN};"
		}
	}
	handle /agent/${f.name} {
		redir /agent/${f.name}/ permanent
	}`).join("\n");

  // WebSocket block — route to correct sandbox based on referer or default to first
  const defaultPort = forwards.length > 0 ? forwards[0].port : 18789;

  return `# Auto-generated Caddy config for Diffract
# Generated at: ${new Date().toISOString()}
# Sandboxes: ${forwards.map((f) => f.name).join(", ") || "none"}

${DOMAIN} {
	# WebSocket — route to appropriate sandbox gateway
	@websocket {
		header Connection *Upgrade*
		header Upgrade websocket
	}
	handle @websocket {
		reverse_proxy 127.0.0.1:${defaultPort} {
			header_up Host 127.0.0.1:${defaultPort}
			header_up Origin http://127.0.0.1:${defaultPort}
		}
	}
${agentBlocks}

	# OpenClaw API + UI root paths — used by the embedded chat UI
	# The OpenClaw JS makes API calls to /__openclaw/api/v1/* at the root level
	# regardless of where the iframe is loaded from.
	handle /__openclaw/* {
		reverse_proxy 127.0.0.1:${defaultPort} {
			header_up Host 127.0.0.1:${defaultPort}
			header_up Origin http://127.0.0.1:${defaultPort}
			header_down -X-Frame-Options
			header_down Content-Security-Policy "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors https://${DOMAIN}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss: https://${DOMAIN};"
		}
	}

	handle /health {
		reverse_proxy 127.0.0.1:${defaultPort} {
			header_up Host 127.0.0.1:${defaultPort}
			header_up Origin http://127.0.0.1:${defaultPort}
		}
	}

	# Diffract dashboard REST API bridge
	handle /api/* {
		reverse_proxy 127.0.0.1:3001
	}

	# Next.js UI (catch-all)
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
`;
}

// GET /api/gateway-routes/:name/embed — HTML page that bootstraps the OpenClaw UI
// Sets window.__OPENCLAW_CONTROL_UI_BASE_PATH__ so API calls route correctly
router.get("/:name/embed", (req, res) => {
  const forwards = getForwardedPorts();
  const match = forwards.find((f) => f.name === req.params.name);
  if (!match) {
    res.status(404).send("No active gateway for this sandbox");
    return;
  }
  // The embed page loads at /agent/<name>/ and sets the base path
  // so OpenClaw UI makes API calls to /agent/<name>/__openclaw/api/v1/*
  const basePath = `/agent/${match.name}`;
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${match.name} — Diffract Agent</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:none}</style>
</head>
<body>
<iframe src="${basePath}/" allow="clipboard-write; clipboard-read"></iframe>
<script>
// Inject base path into the iframe once it loads
const iframe = document.querySelector('iframe');
iframe.addEventListener('load', () => {
  try {
    iframe.contentWindow.__OPENCLAW_CONTROL_UI_BASE_PATH__ = '${basePath}';
  } catch(e) { /* cross-origin, handled by gateway */ }
});
</script>
</body>
</html>`);
});

export default router;
