---
title:
  page: "How Diffraction Works — Plugin, Blueprint, and Sandbox Lifecycle"
  nav: "How It Works"
description: "Plugin, blueprint, sandbox creation, and inference routing concepts."
keywords: ["how diffraction works", "diffraction sandbox lifecycle blueprint"]
topics: ["generative_ai", "ai_agents"]
tags: ["diffraction", "openshell", "sandboxing", "inference_routing", "blueprints", "network_policy"]
content:
  type: concept
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# How Diffraction Works

Diffraction combines a lightweight CLI plugin with a versioned blueprint to move Diffraction into a controlled sandbox.
This page explains the key concepts about Diffraction at a high level.

## How It Fits Together

The `diffraction` CLI is the primary entrypoint for setting up and managing sandboxed Diffraction agents.
It delegates heavy lifting to a versioned blueprint, a Python artifact that orchestrates sandbox creation, policy application, and inference provider setup through the OpenShell CLI.

```{mermaid}
flowchart TB
    subgraph Host
        CMD["diffraction onboard"]
        PLUGIN[diffraction plugin]
        BLUEPRINT[blueprint runner]
        CLI["openshell CLI sandbox · gateway · inference · policy"]

        CMD --> PLUGIN
        PLUGIN --> BLUEPRINT
        BLUEPRINT --> CLI
    end

    subgraph Sandbox["OpenShell Sandbox"]
        AGENT[Diffraction agent]
        INF[NVIDIA inference, routed]
        NET[strict network policy]
        FS[filesystem isolation]

        AGENT --- INF
        AGENT --- NET
        AGENT --- FS
    end

    PLUGIN --> AGENT

    classDef nv fill:#76b900,stroke:#333,color:#fff
    classDef nvLight fill:#e6f2cc,stroke:#76b900,color:#1a1a1a
    classDef nvDark fill:#333,stroke:#76b900,color:#fff

    class CMD,PLUGIN,BLUEPRINT nvDark
    class CLI nv
    class AGENT nv
    class INF,NET,FS nvLight

    style Host fill:none,stroke:#76b900,stroke-width:2px,color:#1a1a1a
    style Sandbox fill:#f5faed,stroke:#76b900,stroke-width:2px,color:#1a1a1a
```

## Design Principles

Diffraction architecture follows the following principles.

Thin plugin, versioned blueprint
: The plugin stays small and stable. Orchestration logic lives in the blueprint and evolves on its own release cadence.

Respect CLI boundaries
: The `diffraction` CLI is the primary interface. Plugin commands are available under `diffraction diffraction` but do not override built-in Diffraction commands.

Supply chain safety
: Blueprint artifacts are immutable, versioned, and digest-verified before execution.

OpenShell-native for new installs
: For users without an existing Diffraction installation, Diffraction recommends `openshell sandbox create` directly
  rather than forcing a plugin-driven bootstrap.

Reproducible setup
: Running setup again recreates the sandbox from the same blueprint and policy definitions.

## Plugin and Blueprint

Diffraction is split into two parts:

- The *plugin* is a TypeScript package that powers the `diffraction` CLI and also registers commands under `diffraction diffraction`.
  It handles user interaction and delegates orchestration work to the blueprint.
- The *blueprint* is a versioned Python artifact that contains all the logic for creating sandboxes, applying policies, and configuring inference.
  The plugin resolves, verifies, and executes the blueprint as a subprocess.

This separation keeps the plugin small and stable while allowing the blueprint to evolve on its own release cadence.

## Sandbox Creation

When you run `diffraction onboard`, Diffraction creates an OpenShell sandbox that runs Diffraction in an isolated container.
The blueprint orchestrates this process through the OpenShell CLI:

1. The plugin downloads the blueprint artifact, checks version compatibility, and verifies the digest.
2. The blueprint determines which OpenShell resources to create or update, such as the gateway, inference providers, sandbox, and network policy.
3. The blueprint calls OpenShell CLI commands to create the sandbox and configure each resource.

After the sandbox starts, the agent runs inside it with all network, filesystem, and inference controls in place.

## Inference Routing

Inference requests from the agent never leave the sandbox directly.
OpenShell intercepts every inference call and routes it to the configured provider.
Diffraction routes inference to NVIDIA cloud, specifically Nemotron 3 Super 120B through [build.nvidia.com](https://build.nvidia.com). You can switch models at runtime without restarting the sandbox.

## Network and Filesystem Policy

The sandbox starts with a strict baseline policy defined in `diffraction-sandbox.yaml`.
This policy controls which network endpoints the agent can reach and which filesystem paths it can access.

- For network, only endpoints listed in the policy are allowed.
  When the agent tries to reach an unlisted host, OpenShell blocks the request and surfaces it in the TUI for operator approval.
- For filesystem, the agent can write to `/sandbox` and `/tmp`.
  All other system paths are read-only.

Approved endpoints persist for the current session but are not saved to the baseline policy file.

## Next Steps

- Follow the [Quickstart](../get-started/quickstart.md) to launch your first sandbox.
- Refer to the [Architecture](../reference/architecture.md) for the full technical structure, including file layouts and the blueprint lifecycle.
- Refer to [Inference Profiles](../reference/inference-profiles.md) for detailed provider configuration.
