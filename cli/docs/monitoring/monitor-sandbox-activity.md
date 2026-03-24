---
title:
  page: "Monitor Diffraction Sandbox Activity and Debug Issues"
  nav: "Monitor Sandbox Activity"
description: "Inspect sandbox health, trace agent behavior, and diagnose problems."
keywords: ["monitor diffraction sandbox", "debug diffraction agent issues"]
topics: ["generative_ai", "ai_agents"]
tags: ["diffraction", "openshell", "monitoring", "troubleshooting", "diffraction"]
content:
  type: how_to
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Monitor Sandbox Activity and Debug Issues

Use the Diffraction status, logs, and TUI tools together to inspect sandbox health, trace agent behavior, and diagnose problems.

## Prerequisites

- A running Diffraction sandbox.
- The OpenShell CLI on your `PATH`.

## Check Sandbox Health

Run the status command to view the sandbox state, blueprint run information, and active inference configuration:

```console
$ diffraction diffraction status
```

For machine-readable output, add the `--json` flag:

```console
$ diffraction diffraction status --json
```

Key fields in the output include the following:

- Sandbox state, which indicates whether the sandbox is running, stopped, or in an error state.
- Blueprint run ID, which is the identifier for the most recent blueprint execution.
- Inference provider, which shows the active provider, model, and endpoint.

If you run `diffraction diffraction status` from inside the sandbox, the command detects the sandbox context and reports it. Host-level sandbox and inference details are not available from within the sandbox. Run `openshell sandbox list` on the host to check the underlying sandbox state.

## View Blueprint and Sandbox Logs

Stream the most recent log output from the blueprint runner and sandbox:

```console
$ diffraction diffraction logs
```

To follow the log output in real time:

```console
$ diffraction diffraction logs -f
```

To display a specific number of log lines:

```console
$ diffraction diffraction logs -n 100
```

To view logs for a specific blueprint run instead of the most recent one:

```console
$ diffraction diffraction logs --run-id <id>
```

## Monitor Network Activity in the TUI

Open the OpenShell terminal UI for a live view of sandbox network activity and egress requests:

```console
$ openshell term
```

For a remote sandbox, SSH to the instance and run `openshell term` there.

The TUI shows the following information:

- Active network connections from the sandbox.
- Blocked egress requests awaiting operator approval.
- Inference routing status.

Refer to [Approve or Deny Agent Network Requests](../network-policy/approve-network-requests.md) for details on handling blocked requests.

## Test Inference

Run a test inference request to verify that the provider is responding:

```console
$ diffraction my-assistant connect
$ diffraction agent --agent main --local -m "Test inference" --session-id debug
```

If the request fails, check the following:

1. Run `diffraction diffraction status` to confirm the active provider and endpoint.
2. Run `diffraction diffraction logs -f` to view error messages from the blueprint runner.
3. Verify that the inference endpoint is reachable from the host.

## Related Topics

- [Troubleshooting](../reference/troubleshooting.md) for common issues and resolution steps.
- [Commands](../reference/commands.md) for the full CLI reference.
- [Approve or Deny Agent Network Requests](../network-policy/approve-network-requests.md) for the operator approval flow.
- [Switch Inference Providers](../inference/switch-inference-providers.md) to change the active provider.
