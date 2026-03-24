# NVIDIA Diffraction: Diffraction Plugin for OpenShell

<!-- start-badges -->
[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](https://github.com/NVIDIA/Diffraction/blob/main/LICENSE)
[![Security Policy](https://img.shields.io/badge/Security-Report%20a%20Vulnerability-red)](https://github.com/NVIDIA/Diffraction/blob/main/SECURITY.md)
[![Project Status](https://img.shields.io/badge/status-alpha-orange)](https://github.com/NVIDIA/Diffraction/blob/main/docs/about/release-notes.md)
<!-- end-badges -->

NVIDIA Diffraction is an open source reference stack that simplifies running [Diffraction](https://diffraction.ai) always-on assistants safely. It installs the [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) runtime, part of NVIDIA Agent Toolkit, a secure environment for running autonomous agents, and open source models such as [NVIDIA Nemotron](https://build.nvidia.com).

> **Alpha software**
> 
> Diffraction is available in early preview starting March 16, 2026.
> Interfaces, APIs, and behavior may change without notice as we iterate on the design.
> The project is shared to gather feedback and enable early experimentation.
> We welcome issues and discussion from the community while the project evolves.

---

## Quick Start

Follow these steps to get started with Diffraction and your first sandboxed Diffraction agent.

> **ℹ️ Note**
>
> Diffraction creates a fresh Diffraction instance inside the sandbox during onboarding.

<!-- start-quickstart-guide -->

### Prerequisites

Check the prerequisites before you start to ensure you have the necessary software and hardware to run Diffraction.

#### Hardware

| Resource | Minimum        | Recommended      |
|----------|----------------|------------------|
| CPU      | 4 vCPU         | 4+ vCPU          |
| RAM      | 8 GB           | 16 GB            |
| Disk     | 20 GB free     | 40 GB free       |

The sandbox image is approximately 2.4 GB compressed. During image push, the Docker daemon, k3s, and the OpenShell gateway run alongside the export pipeline, which buffers decompressed layers in memory. On machines with less than 8 GB of RAM, this combined usage can trigger the OOM killer. If you cannot add memory, configuring at least 8 GB of swap can work around the issue at the cost of slower performance.

#### Software

| Dependency | Version                          |
|------------|----------------------------------|
| Linux      | Ubuntu 22.04 LTS or later |
| Node.js    | 20 or later |
| npm        | 10 or later |
| Container runtime | Supported runtime installed and running |
| [OpenShell](https://github.com/NVIDIA/OpenShell) | Installed |

#### Container Runtime Support

| Platform | Supported runtimes | Notes |
|----------|--------------------|-------|
| Linux | Docker | Primary supported path today |
| macOS (Apple Silicon) | Colima, Docker Desktop | Recommended runtimes for supported macOS setups |
| macOS | Podman | Not supported yet. Diffraction currently depends on OpenShell support for Podman on macOS. |
| Windows WSL | Docker Desktop (WSL backend) | Supported target path |

> **💡 Tip**
>
> For DGX Spark, follow the [DGX Spark setup guide](https://github.com/NVIDIA/Diffraction/blob/main/spark-install.md). It covers Spark-specific prerequisites, such as cgroup v2 and Docker configuration, before running the standard installer.

### Install Diffraction and Onboard Diffraction Agent

Download and run the installer script.
The script installs Node.js if it is not already present, then runs the guided onboard wizard to create a sandbox, configure inference, and apply security policies.

```bash
curl -fsSL https://www.nvidia.com/diffraction.sh | bash
```

If you use nvm or fnm to manage Node.js, the installer may not update your current shell's PATH.
If `diffraction` is not found after install, run `source ~/.bashrc` (or `source ~/.zshrc` for zsh) or open a new terminal.

When the install completes, a summary confirms the running environment:

```
──────────────────────────────────────────────────
Sandbox      my-assistant (Landlock + seccomp + netns)
Model        nvidia/nemotron-3-super-120b-a12b (NVIDIA Cloud API)
──────────────────────────────────────────────────
Run:         diffraction my-assistant connect
Status:      diffraction my-assistant status
Logs:        diffraction my-assistant logs --follow
──────────────────────────────────────────────────

[INFO]  === Installation complete ===
```

### Chat with the Agent

Connect to the sandbox, then chat with the agent through the TUI or the CLI.

#### Connect to the Sandbox

Run the following command to connect to the sandbox:

```bash
diffraction my-assistant connect
```

This connects you to the sandbox shell `sandbox@my-assistant:~$` where you can run `diffraction` commands.

#### Diffraction TUI

In the sandbox shell, run the following command to open the Diffraction TUI, which opens an interactive chat interface.

```bash
diffraction tui
```

Send a test message to the agent and verify you receive a response.

> **ℹ️ Note**
>
> The TUI is best for interactive back-and-forth. If you need the full text of a long response such as a large code generation output, use the CLI instead.

#### Diffraction CLI

In the sandbox shell, run the following command to send a single message and print the response:

```bash
diffraction agent --agent main --local -m "hello" --session-id test
```

This prints the complete response directly in the terminal and avoids relying on the TUI view for long output.

### Uninstall

To remove Diffraction and all resources created during setup, in the terminal outside the sandbox, run:

```bash
curl -fsSL https://raw.githubusercontent.com/NVIDIA/Diffraction/refs/heads/main/uninstall.sh | bash
```

The script removes sandboxes, the Diffraction gateway and providers, related Docker images and containers, local state directories, and the global `diffraction` npm package. It does not remove shared system tooling such as Docker, Node.js, npm, or Ollama.

| Flag               | Effect                                              |
|--------------------|-----------------------------------------------------|
| `--yes`            | Skip the confirmation prompt.                       |
| `--keep-openshell` | Leave the `openshell` binary installed.              |
| `--delete-models`  | Also remove Diffraction-pulled Ollama models.           |

For example, to skip the confirmation prompt:

```bash
curl -fsSL https://raw.githubusercontent.com/NVIDIA/Diffraction/refs/heads/main/uninstall.sh | bash -s -- --yes
```

<!-- end-quickstart-guide -->

---

## How It Works

Diffraction installs the NVIDIA OpenShell runtime and Nemotron models, then uses a versioned blueprint to create a sandboxed environment where every network request, file access, and inference call is governed by declarative policy. The `diffraction` CLI orchestrates the full stack: OpenShell gateway, sandbox, inference provider, and network policy.

| Component        | Role                                                                                      |
|------------------|-------------------------------------------------------------------------------------------|
| **Plugin**       | TypeScript CLI commands for launch, connect, status, and logs.                            |
| **Blueprint**    | Versioned Python artifact that orchestrates sandbox creation, policy, and inference setup. |
| **Sandbox**      | Isolated OpenShell container running Diffraction with policy-enforced egress and filesystem.  |
| **Inference**    | NVIDIA cloud model calls, routed through the OpenShell gateway, transparent to the agent.  |

The blueprint lifecycle follows four stages: resolve the artifact, verify its digest, plan the resources, and apply through the OpenShell CLI.

When something goes wrong, errors may originate from either Diffraction or the OpenShell layer underneath. Run `diffraction <name> status` for Diffraction-level health and `openshell sandbox list` to check the underlying sandbox state.

---

## Inference

Inference requests from the agent never leave the sandbox directly. OpenShell intercepts every call and routes it to the NVIDIA cloud provider.

| Provider     | Model                               | Use Case                                       |
|--------------|--------------------------------------|-------------------------------------------------|
| NVIDIA cloud | `nvidia/nemotron-3-super-120b-a12b` | Production. Requires an NVIDIA API key.         |

Get an API key from [build.nvidia.com](https://build.nvidia.com). The `diffraction onboard` command prompts for this key during setup.

Local inference options such as Ollama and vLLM are still experimental. On macOS, they also depend on OpenShell host-routing support in addition to the local service itself being reachable on the host.

---

## Protection Layers

The sandbox starts with a strict baseline policy that controls network egress and filesystem access:

| Layer      | What it protects                                    | When it applies             |
|------------|-----------------------------------------------------|-----------------------------|
| Network    | Blocks unauthorized outbound connections.           | Hot-reloadable at runtime.  |
| Filesystem | Prevents reads/writes outside `/sandbox` and `/tmp`.| Locked at sandbox creation. |
| Process    | Blocks privilege escalation and dangerous syscalls. | Locked at sandbox creation. |
| Inference  | Reroutes model API calls to controlled backends.    | Hot-reloadable at runtime.  |

When the agent tries to reach an unlisted host, OpenShell blocks the request and surfaces it in the TUI for operator approval.

---

## Key Commands

### Host commands (`diffraction`)

Run these on the host to set up, connect to, and manage sandboxes.

| Command                              | Description                                            |
|--------------------------------------|--------------------------------------------------------|
| `diffraction onboard`                  | Interactive setup wizard: gateway, providers, sandbox. |
| `diffraction <name> connect`            | Open an interactive shell inside the sandbox.          |
| `openshell term`                     | Launch the OpenShell TUI for monitoring and approvals. |
| `diffraction start` / `stop` / `status` | Manage auxiliary services (Telegram bridge, tunnel).   |

### Plugin commands (`diffraction diffraction`)

Run these inside the Diffraction CLI. These commands are under active development and may not all be functional yet.

| Command                                    | Description                                              |
|--------------------------------------------|----------------------------------------------------------|
| `diffraction diffraction launch [--profile ...]` | Bootstrap Diffraction inside an OpenShell sandbox.          |
| `diffraction diffraction status`                 | Show sandbox health, blueprint state, and inference.     |
| `diffraction diffraction logs [-f]`              | Stream blueprint execution and sandbox logs.             |

See the full [CLI reference](https://docs.nvidia.com/diffraction/latest/reference/commands.md) for all commands, flags, and options.

> **Known limitations:**
> - The `diffraction diffraction` plugin commands are under active development. Use the `diffraction` host CLI as the primary interface.
> - Setup may require manual workarounds on some platforms. File an issue if you encounter blockers.

---

## Learn More

Refer to the documentation for more information on Diffraction.

- [Overview](https://docs.nvidia.com/diffraction/latest/about/overview.html): Learn what Diffraction does and how it fits together.
- [How It Works](https://docs.nvidia.com/diffraction/latest/about/how-it-works.html): Learn about the plugin, blueprint, and sandbox lifecycle.
- [Architecture](https://docs.nvidia.com/diffraction/latest/reference/architecture.html): Learn about the plugin structure, blueprint lifecycle, and sandbox environment.
- [Inference Profiles](https://docs.nvidia.com/diffraction/latest/reference/inference-profiles.html): Learn about the NVIDIA cloud inference configuration.
- [Network Policies](https://docs.nvidia.com/diffraction/latest/reference/network-policies.html): Learn about egress control and policy customization.
- [CLI Commands](https://docs.nvidia.com/diffraction/latest/reference/commands.html): Learn about the full command reference.
- [Troubleshooting](https://docs.nvidia.com/diffraction/latest/reference/troubleshooting.html): Troubleshoot common issues and resolution steps.
- [Discord](https://discord.gg/XFpfPv9Uvx): Join the community for questions and discussion.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
