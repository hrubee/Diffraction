---
title:
  page: Quickstart
  nav: Quickstart
description: Install the Diffract CLI and create your first sandboxed AI agent in two commands.
topics:
- Generative AI
- Cybersecurity
tags:
- AI Agents
- Sandboxing
- Installation
- Quickstart
content:
  type: get_started
  difficulty: technical_beginner
  audience:
  - engineer
  - data_scientist
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Quickstart

This page gets you from zero to a running, policy-enforced sandbox in two commands.

## Prerequisites

Before you begin, make sure you have:

- Docker Desktop running on your machine.

For a complete list of requirements, refer to {doc}`../reference/support-matrix`.

## Install the Diffract CLI

Run the install script:

```console
$ curl -LsSf https://raw.githubusercontent.com/NVIDIA/Diffract/main/install.sh | sh
```

If you prefer [uv](https://docs.astral.sh/uv/):

```console
$ uv tool install -U diffract
```

After installing the CLI, run `diffract --help` in your terminal to see the full CLI reference, including all commands and flags.

:::{tip}
You can also clone the [NVIDIA Diffract GitHub repository](https://github.com/NVIDIA/Diffract) and use the `/diffract-cli` skill to load the CLI reference into your agent.
:::

## Create Your First Diffract Sandbox

Create a sandbox and launch an agent inside it.
Choose the tab that matches your agent:

::::{tab-set}

:::{tab-item} Claude Code

Run the following command to create a sandbox with Claude Code:

```console
$ diffract sandbox create -- claude
```

The CLI prompts you to create a provider from local credentials.
Type `yes` to continue.
If `ANTHROPIC_API_KEY` is set in your environment, the CLI picks it up automatically.
If not, you can configure it from inside the sandbox after it launches.
:::

:::{tab-item} OpenCode

Run the following command to create a sandbox with OpenCode:

```console
$ diffract sandbox create -- opencode
```

The CLI prompts you to create a provider from local credentials.
Type `yes` to continue.
If `OPENAI_API_KEY` or `OPENROUTER_API_KEY` is set in your environment, the CLI picks it up automatically.
If not, you can configure it from inside the sandbox after it launches.
:::

:::{tab-item} Codex

Run the following command to create a sandbox with Codex:

```console
$ diffract sandbox create -- codex
```

The CLI prompts you to create a provider from local credentials.
Type `yes` to continue.
If `OPENAI_API_KEY` is set in your environment, the CLI picks it up automatically.
If not, you can configure it from inside the sandbox after it launches.
:::

:::{tab-item} Diffraction

Run the following command to create a sandbox with Diffraction:

```console
$ diffract sandbox create --from diffraction
```

The `--from` flag pulls a pre-built sandbox definition from the [Diffract Community](https://github.com/NVIDIA/Diffract-Community) catalog.
Each definition bundles a container image, a tailored policy, and optional skills into a single package.
:::

:::{tab-item} Community Sandbox

Use the `--from` flag to pull other Diffract sandbox images from the [NVIDIA Container Registry](https://registry.nvidia.com/).
For example, to pull the `base` image, run the following command:

```console
$ diffract sandbox create --from base
```

:::

::::

## Deploy a Gateway (Optional)

Running `diffract sandbox create` without a gateway auto-bootstraps a local one.
To start the gateway explicitly or deploy to a remote host, choose the tab that matches your setup.

:::::{tab-set}

::::{tab-item} Brev

:::{note}
Deploy an Diffract gateway on Brev by clicking **Deploy** on the [Diffract Launchable](https://brev.nvidia.com/launchable/deploy/now?launchableID=env-3Ap3tL55zq4a8kew1AuW0FpSLsg).
:::

After the instance starts running, find the gateway URL in the Brev console under **Using Secure Links**.
Copy the shareable URL for **port 8080**, which is the gateway endpoint.

```console
$ diffract gateway add https://<your-port-8080-url>.brevlab.com
$ diffract status
```

::::

::::{tab-item} DGX Spark

:::{note}
Set up your Spark with NVIDIA Sync first, or make sure SSH access is configured (such as SSH keys added to the host).
:::

Deploy to a DGX Spark machine over SSH:

```console
$ diffract gateway start --remote <username>@<spark-ssid>.local
$ diffract status
```

After `diffract status` shows the gateway as healthy, all subsequent commands route through the SSH tunnel.

::::

:::::
