#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Telegram → Diffract bridge.
 *
 * Messages from Telegram are forwarded to the Diffract agent running
 * inside the sandbox. When the agent needs external access, the
 * Diffract TUI lights up for approval. Responses go back to Telegram.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   NVIDIA_API_KEY      — for inference
 *   SANDBOX_NAME        — sandbox name (default: diffract)
 *   ALLOWED_CHAT_IDS    — comma-separated Telegram chat IDs to accept (optional, accepts all if unset)
 */

const https = require("https");
const { execSync, spawn } = require("child_process");
const { resolveOpenshell } = require("../cli/bin/lib/resolve-openshell");

const OPENSHELL = resolveOpenshell();
if (!OPENSHELL) {
  console.error("diffract not found on PATH or in common locations");
  process.exit(1);
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SANDBOX = process.env.SANDBOX_NAME || "diffract";
const ALLOWED_CHATS = process.env.ALLOWED_CHAT_IDS
  ? process.env.ALLOWED_CHAT_IDS.split(",").map((s) => s.trim())
  : null;

const RATE_LIMIT_PER_MIN = parseInt(process.env.DIFFRACT_TG_RATE_LIMIT || "10", 10);

if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN required"); process.exit(1); }

let offset = 0;

// Per-chat rate limiter: tracks message timestamps per chat
const chatRateBuckets = new Map();

function isRateLimited(chatId) {
  const now = Date.now();
  const window = 60000; // 1 minute
  if (!chatRateBuckets.has(chatId)) {
    chatRateBuckets.set(chatId, []);
  }
  const timestamps = chatRateBuckets.get(chatId);
  // Prune old entries
  while (timestamps.length > 0 && timestamps[0] < now - window) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_PER_MIN) {
    return true;
  }
  timestamps.push(now);
  return false;
}
const activeSessions = new Map(); // chatId → message history

// ── Telegram API helpers ──────────────────────────────────────────

function tgApi(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TOKEN}/${method}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false, error: buf }); }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function sendMessage(chatId, text, replyTo) {
  // Telegram max message length is 4096
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: chunk,
      reply_to_message_id: replyTo,
      parse_mode: "Markdown",
    }).catch(() =>
      // Retry without markdown if it fails (unbalanced formatting)
      tgApi("sendMessage", { chat_id: chatId, text: chunk, reply_to_message_id: replyTo }),
    );
  }
}

async function sendTyping(chatId) {
  await tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

// ── Run agent inside sandbox ──────────────────────────────────────

function runAgentInSandbox(message, sessionId) {
  return new Promise((resolve) => {
    const sshConfig = execSync(`"${OPENSHELL}" sandbox ssh-config "${SANDBOX}"`, { encoding: "utf-8" });

    // Write temp ssh config
    const confPath = `/tmp/diffract-tg-ssh-${sessionId}.conf`;
    require("fs").writeFileSync(confPath, sshConfig);

    const escaped = message.replace(/'/g, "'\\''");
    const cmd = `cd /sandbox && diffract-cli agent --agent main --local -m '${escaped}' --session-id 'tg-${sessionId}'`;

    const proc = spawn("ssh", ["-T", "-F", confPath, `openshell-${SANDBOX}`, cmd], {
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      try { require("fs").unlinkSync(confPath); } catch {}

      // Extract the actual agent response — skip setup lines
      const lines = stdout.split("\n");
      const responseLines = lines.filter(
        (l) =>
          !l.startsWith("Setting up Diffract") &&
          !l.startsWith("[plugins]") &&
          !l.startsWith("(node:") &&
          !l.includes("Diffract ready") &&
          !l.includes("Diffract registered") &&
          !l.includes("diffract-cli agent") &&
          !l.includes("┌─") &&
          !l.includes("│ ") &&
          !l.includes("└─") &&
          l.trim() !== "",
      );

      const response = responseLines.join("\n").trim();

      if (response) {
        resolve(response);
      } else if (code !== 0) {
        resolve(`Agent exited with code ${code}. ${stderr.trim().slice(0, 500)}`);
      } else {
        resolve("(no response)");
      }
    });

    proc.on("error", (err) => {
      resolve(`Error: ${err.message}`);
    });
  });
}

// ── Poll loop ─────────────────────────────────────────────────────

let pollBackoff = 100;        // ms — starts at 100ms, grows on errors
const POLL_MIN_DELAY = 100;
const POLL_MAX_DELAY = 30000; // 30s cap

async function poll() {
  try {
    const res = await tgApi("getUpdates", { offset, timeout: 30 });

    // Reset backoff on successful poll
    pollBackoff = POLL_MIN_DELAY;

    if (res.ok && res.result?.length > 0) {
      for (const update of res.result) {
        offset = update.update_id + 1;

        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = String(msg.chat.id);

        // Access control
        if (ALLOWED_CHATS && !ALLOWED_CHATS.includes(chatId)) {
          console.log(`[ignored] chat ${chatId} not in allowed list`);
          continue;
        }

        // Rate limiting
        if (isRateLimited(chatId)) {
          console.log(`[rate-limited] chat ${chatId} exceeded ${RATE_LIMIT_PER_MIN} msgs/min`);
          await sendMessage(chatId, `Rate limit: max ${RATE_LIMIT_PER_MIN} messages per minute. Please wait.`, msg.message_id);
          continue;
        }

        const userName = msg.from?.first_name || "someone";
        console.log(`[${chatId}] ${userName}: ${msg.text}`);

        // Handle /start
        if (msg.text === "/start") {
          await sendMessage(
            chatId,
            "🦀 *Diffract* — powered by Nemotron 3 Super 120B\n\n" +
              "Send me a message and I'll run it through the Diffract agent " +
              "inside an Diffract sandbox.\n\n" +
              "If the agent needs external access, the TUI will prompt for approval.",
            msg.message_id,
          );
          continue;
        }

        // Handle /reset
        if (msg.text === "/reset") {
          activeSessions.delete(chatId);
          await sendMessage(chatId, "Session reset.", msg.message_id);
          continue;
        }

        // Send typing indicator
        await sendTyping(chatId);

        // Keep a typing indicator going while agent runs
        const typingInterval = setInterval(() => sendTyping(chatId), 4000);

        try {
          const response = await runAgentInSandbox(msg.text, chatId);
          clearInterval(typingInterval);
          console.log(`[${chatId}] agent: ${response.slice(0, 100)}...`);
          await sendMessage(chatId, response, msg.message_id);
        } catch (err) {
          clearInterval(typingInterval);
          await sendMessage(chatId, `Error: ${err.message}`, msg.message_id);
        }
      }
    }
  } catch (err) {
    // Exponential backoff on poll errors (network issues, API rate limits)
    pollBackoff = Math.min(pollBackoff * 2, POLL_MAX_DELAY);
    console.error(`Poll error (retry in ${pollBackoff}ms): ${err.message}`);
  }

  // Continue polling with backoff
  setTimeout(poll, pollBackoff);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const me = await tgApi("getMe", {});
  if (!me.ok) {
    console.error("Failed to connect to Telegram:", JSON.stringify(me));
    process.exit(1);
  }

  console.log("");
  console.log("  ┌─────────────────────────────────────────────────────┐");
  console.log("  │  Diffract Telegram Bridge                          │");
  console.log("  │                                                     │");
  console.log(`  │  Bot:      @${(me.result.username + "                    ").slice(0, 37)}│`);
  console.log("  │  Sandbox:  " + (SANDBOX + "                              ").slice(0, 40) + "│");
  console.log("  │  Model:    nvidia/nemotron-3-super-120b-a12b       │");
  console.log("  │                                                     │");
  console.log("  │  Messages are forwarded to the Diffract agent      │");
  console.log("  │  inside the sandbox. Run 'diffract term' in       │");
  console.log("  │  another terminal to monitor + approve egress.     │");
  console.log("  └─────────────────────────────────────────────────────┘");
  console.log("");

  poll();
}

main();
