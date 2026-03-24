---
title:
  page: "Diffraction CLI Commands Reference"
  nav: "Commands"
description: "Full CLI reference for plugin and standalone Diffraction commands."
keywords: ["diffraction cli commands", "diffraction command reference"]
topics: ["generative_ai", "ai_agents"]
tags: ["diffraction", "openshell", "diffraction", "cli"]
content:
  type: reference
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Commands

Diffraction provides two command interfaces.
The plugin commands run under the `diffraction diffraction` namespace inside the Diffraction CLI.
The standalone `diffraction` binary handles host-side setup, deployment, and service management.
Both interfaces are installed when you run `npm install -g diffraction`.

## Plugin Commands

### `diffraction diffraction launch`

Bootstrap Diffraction inside an OpenShell sandbox.
If Diffraction detects an existing host installation, `launch` stops unless you pass `--force`.

```console
$ diffraction diffraction launch [--force] [--profile <profile>]
```

`--force`
: Skip the ergonomics warning and force plugin-driven bootstrap. Without this flag,
  Diffraction recommends using `openshell sandbox create` directly for new installs.

`--profile <profile>`
: Blueprint profile to use. Default: `default`.

### `diffraction <name> connect`

Open an interactive shell inside the Diffraction sandbox.
Use this after launch to connect and chat with the agent through the TUI or CLI.

```console
$ diffraction my-assistant connect
```

If the TUI view is not a good fit for very long responses, use the CLI form instead:

```console
$ diffraction agent --agent main --local -m "<prompt>" --session-id <id>
```

This is the recommended workaround when you need the full response printed directly in the terminal.

### `diffraction diffraction status`

Display sandbox health, blueprint run state, and inference configuration.

```console
$ diffraction diffraction status [--json]
```

`--json`
: Output as JSON for programmatic consumption.

When running inside an active OpenShell sandbox, the status command detects the sandbox context and reports "active (inside sandbox)" instead of false negatives.
Host-side sandbox state and inference configuration are not inspectable from inside the sandbox.
Run `openshell sandbox list` on the host to check the underlying sandbox state.

### `diffraction diffraction logs`

Stream blueprint execution and sandbox logs.

```console
$ diffraction diffraction logs [-f] [-n <count>] [--run-id <id>]
```

`-f, --follow`
: Follow log output, similar to `tail -f`.

`-n, --lines <count>`
: Number of lines to show. Default: `50`.

`--run-id <id>`
: Show logs for a specific blueprint run instead of the latest.

### `/diffraction` Slash Command

The `/diffraction` slash command is available inside the Diffraction chat interface for quick actions:

| Subcommand | Description |
|---|---|
| `/diffraction status` | Show sandbox and inference state |

## Standalone Host Commands

The `diffraction` binary handles host-side operations that run outside the Diffraction plugin context.

### `diffraction onboard`

Run the interactive setup wizard.
The wizard creates an OpenShell gateway, registers inference providers, builds the sandbox image, and creates the sandbox.
Use this command for new installs and for recreating a sandbox after changes to policy or configuration.

```console
$ diffraction onboard
```

The first run prompts for your NVIDIA API key and saves it to `~/.diffraction/credentials.json`.

The wizard prompts for a sandbox name.
Names must follow RFC 1123 subdomain rules: lowercase alphanumeric characters and hyphens only, and must start and end with an alphanumeric character.
Uppercase letters are automatically lowercased.

Before creating the gateway, the wizard runs preflight checks.
On systems with cgroup v2 (Ubuntu 24.04, DGX Spark, WSL2), it verifies that Docker is configured with `"default-cgroupns-mode": "host"` and provides fix instructions if the setting is missing.

### `diffraction list`

List all registered sandboxes with their model, provider, and policy presets.

```console
$ diffraction list
```

### `diffraction deploy`

:::{warning}
The `diffraction deploy` command is experimental and may not work as expected.
:::

Deploy Diffraction to a remote GPU instance through [Brev](https://brev.nvidia.com).
The deploy script installs Docker, NVIDIA Container Toolkit if a GPU is present, and OpenShell on the VM, then runs the diffraction setup and connects to the sandbox.

```console
$ diffraction deploy <instance-name>
```

### `diffraction <name> connect`

Connect to a sandbox by name.

```console
$ diffraction my-assistant connect
```

### `diffraction <name> status`

Show sandbox status, health, and inference configuration.

```console
$ diffraction my-assistant status
```

### `diffraction <name> logs`

View sandbox logs.
Use `--follow` to stream output in real time.

```console
$ diffraction my-assistant logs [--follow]
```

### `diffraction <name> destroy`

Stop the NIM container and delete the sandbox.
This removes the sandbox from the registry.

```console
$ diffraction my-assistant destroy
```

### `diffraction <name> policy-add`

Add a policy preset to a sandbox.
Presets extend the baseline network policy with additional endpoints.

```console
$ diffraction my-assistant policy-add
```

### `diffraction <name> policy-list`

List available policy presets and show which ones are applied to the sandbox.

```console
$ diffraction my-assistant policy-list
```

### `openshell term`

Open the OpenShell TUI to monitor sandbox activity and approve network egress requests.
Run this on the host where the sandbox is running.

```console
$ openshell term
```

For a remote Brev instance, SSH to the instance and run `openshell term` there, or use a port-forward to the gateway.

### `diffraction start`

Start auxiliary services, such as the Telegram bridge and cloudflared tunnel.

```console
$ diffraction start
```

Requires `TELEGRAM_BOT_TOKEN` for the Telegram bridge.

### `diffraction stop`

Stop all auxiliary services.

```console
$ diffraction stop
```

### `diffraction status`

Show the sandbox list and the status of auxiliary services.

```console
$ diffraction status
```

### `diffraction setup-spark`

Set up Diffraction on DGX Spark.
This command applies cgroup v2 and Docker fixes required for Ubuntu 24.04.
Run with `sudo` on the Spark host.
After the fixes complete, the script prompts you to run `diffraction onboard` to continue setup.

```console
$ sudo diffraction setup-spark
```
