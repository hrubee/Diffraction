#!/usr/bin/env node
// CLI bridge for the Diffract UI — exposes CLI lib functions as JSON over stdout.
// Usage: node cli-bridge.js <action> [args...]
//
// Actions:
//   models.list          → JSON array of cloud models
//   policies.list        → JSON array of presets
//   policies.applied <n> → JSON array of applied preset names for sandbox n
//   policies.apply <n> <preset> → apply preset to sandbox n
//   hub.list             → JSON array of installed skills
//   hub.install <source> → install skill, return JSON
//   hub.remove <name>    → remove skill
//   hub.info <name>      → skill info JSON
//   registry.list        → JSON sandbox list

const path = require("path");

// Resolve CLI lib relative to this script's location (ui/cli-bridge.js → ../cli/bin/lib/)
const CLI_LIB = path.join(__dirname, "..", "cli", "bin", "lib");

function out(data) {
  process.stdout.write(JSON.stringify(data) + "\n");
}

const [action, ...args] = process.argv.slice(2);

try {
  switch (action) {
    case "models.list": {
      const reg = require(path.join(CLI_LIB, "model-registry"));
      out(reg.getCloudModels());
      break;
    }
    case "policies.list": {
      const pol = require(path.join(CLI_LIB, "policies"));
      out(pol.listPresets());
      break;
    }
    case "policies.applied": {
      const pol = require(path.join(CLI_LIB, "policies"));
      out(pol.getAppliedPresets(args[0]));
      break;
    }
    case "policies.apply": {
      const pol = require(path.join(CLI_LIB, "policies"));
      pol.applyPreset(args[0], args[1]);
      out({ ok: true });
      break;
    }
    case "hub.list": {
      const hub = require(path.join(CLI_LIB, "hub"));
      out(hub.listInstalled());
      break;
    }
    case "hub.install": {
      const hub = require(path.join(CLI_LIB, "hub"));
      out(hub.install(args[0]));
      break;
    }
    case "hub.remove": {
      const hub = require(path.join(CLI_LIB, "hub"));
      out({ ok: hub.remove(args[0]) });
      break;
    }
    case "hub.info": {
      const hub = require(path.join(CLI_LIB, "hub"));
      out(hub.info(args[0]));
      break;
    }
    case "registry.list": {
      const reg = require(path.join(CLI_LIB, "registry"));
      out(reg.listSandboxes());
      break;
    }
    default:
      out({ error: `Unknown action: ${action}` });
      process.exit(1);
  }
} catch (err) {
  out({ error: err.message });
  process.exit(1);
}
