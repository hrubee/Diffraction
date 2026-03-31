// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// Structured logger for Diffract CLI — outputs JSON lines when
// DIFFRACT_LOG_FORMAT=json, otherwise human-readable colored output.
// Enterprise-ready for ELK, Datadog, and other log aggregators.

const LOG_FORMAT = process.env.DIFFRACT_LOG_FORMAT || "text";
const LOG_LEVEL = process.env.DIFFRACT_LOG_LEVEL || "info";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = { debug: "\x1b[2m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";

function shouldLog(level) {
  return (LEVELS[level] || 0) >= (LEVELS[LOG_LEVEL] || 0);
}

function formatJson(level, component, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...meta,
  });
}

function formatText(level, component, message) {
  const color = COLORS[level] || "";
  const prefix = component ? `[${component}]` : "";
  return `${color}${prefix}${RESET} ${message}`;
}

function log(level, component, message, meta) {
  if (!shouldLog(level)) return;
  if (LOG_FORMAT === "json") {
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(formatJson(level, component, message, meta) + "\n");
  } else {
    const stream = level === "error" ? console.error : console.log;
    stream(formatText(level, component, message));
  }
}

/** Create a scoped logger for a component */
function createLogger(component) {
  return {
    debug: (msg, meta) => log("debug", component, msg, meta),
    info: (msg, meta) => log("info", component, msg, meta),
    warn: (msg, meta) => log("warn", component, msg, meta),
    error: (msg, meta) => log("error", component, msg, meta),
  };
}

module.exports = { createLogger, log };
