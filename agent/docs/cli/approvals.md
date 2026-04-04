---
summary: "CLI reference for `diffraction approvals` (exec approvals for gateway or node hosts)"
read_when:
  - You want to edit exec approvals from the CLI
  - You need to manage allowlists on gateway or node hosts
title: "approvals"
---

# `diffraction approvals`

Manage exec approvals for the **local host**, **gateway host**, or a **node host**.
By default, commands target the local approvals file on disk. Use `--gateway` to target the gateway, or `--node` to target a specific node.

Related:

- Exec approvals: [Exec approvals](/tools/exec-approvals)
- Nodes: [Nodes](/nodes)

## Common commands

```bash
diffraction approvals get
diffraction approvals get --node <id|name|ip>
diffraction approvals get --gateway
```

## Replace approvals from a file

```bash
diffraction approvals set --file ./exec-approvals.json
diffraction approvals set --node <id|name|ip> --file ./exec-approvals.json
diffraction approvals set --gateway --file ./exec-approvals.json
```

## Allowlist helpers

```bash
diffraction approvals allowlist add "~/Projects/**/bin/rg"
diffraction approvals allowlist add --agent main --node <id|name|ip> "/usr/bin/uptime"
diffraction approvals allowlist add --agent "*" "/usr/bin/uname"

diffraction approvals allowlist remove "~/Projects/**/bin/rg"
```

## Notes

- `--node` uses the same resolver as `diffraction nodes` (id, name, ip, or id prefix).
- `--agent` defaults to `"*"`, which applies to all agents.
- The node host must advertise `system.execApprovals.get/set` (macOS app or headless node host).
- Approvals files are stored per host at `~/.diffraction/exec-approvals.json`.
