# Diffraction

**Enterprise AI Agent Distribution** — a managed, secure wrapper that deploys autonomous AI agents safely inside any organisation.

Diffraction plays the same role NemoClaw plays for NVIDIA: it takes the raw power of autonomous agents and packages them into a controlled, policy-governed, enterprise-ready service — with one command.

---

## Architecture

Diffraction is a **three-layer stack**, each layer is a separate open technology:

```
┌─────────────────────────────────────────────────────────┐
│               DIFFRACTION  (this repo)                  │
│         Enterprise distributor & management CLI         │
│  Policy management · Inference routing · Single command │
└───────────────────────┬─────────────────────────────────┘
                        │ orchestrates
         ┌──────────────┴──────────────┐
         ▼                             ▼
┌─────────────────┐         ┌──────────────────────────┐
│   OpenShell     │         │       OpenClaw           │
│  (engine/)      │         │       (agent/)           │
│                 │         │                          │
│  Secure runtime │         │  Autonomous AI agent     │
│  Landlock FS    │         │  Language model brain    │
│  seccomp calls  │         │  Skills, tools, memory   │
│  Network NS     │         │  Multi-provider LLM      │
└─────────────────┘         └──────────────────────────┘
```

| Layer | What it does | Equivalent in NVIDIA stack |
|---|---|---|
| **Diffraction** (`cli/`) | Distributor. CLI, policies, inference routing, setup wizard | NemoClaw |
| **OpenShell** (`engine/`) | Secure runtime that sandboxes the agent | OpenShell |
| **OpenClaw** (`agent/`) | The AI agent — reasoning, tools, memory | OpenClaw |

### Why this architecture matters

- **OpenShell** enforces security *outside* the agent's own process — a compromised agent cannot change its own jail.
- **OpenClaw** runs *inside* the sandbox, so it has zero access to the host filesystem, network, or credentials beyond what policy explicitly allows.
- **Diffraction** manages the whole thing: it creates the sandbox, injects the right policies, routes inference (local or cloud), and gives IT teams YAML files they can audit and approve.

---

## What Diffraction adds on top

| Capability | How |
|---|---|
| Single-command setup | `./diffraction.sh onboard` — 7-step wizard from zero to running agent |
| Policy management | YAML policy files in `cli/diffraction-blueprint/policies/` |
| Inference routing | Choose: Diffraction Cloud (NVIDIA API), local Ollama, local vLLM, or NIM GPU |
| Privacy control | Sensitive traffic stays local; general queries can use cloud models |
| Enterprise packaging | Git-clonable, Docker-based, no registry dependency |

---

## Requirements

| Tool | Minimum version |
|---|---|
| [Node.js](https://nodejs.org) | v20+ |
| [Docker Desktop](https://www.docker.com/products/docker-desktop) | Latest stable |

---

## Quick Start

```bash
git clone https://github.com/hrubee/Diffraction.git
cd Diffraction

chmod +x diffraction.sh
./diffraction.sh onboard
```

The 7-step wizard handles everything:
1. Preflight checks
2. Start OpenShell gateway (secure sandbox cluster)
3. Create named sandbox  
4. Configure AI inference (cloud or local)
5. Set up inference provider inside sandbox
6. Deploy OpenClaw agent inside sandbox
7. Apply security policy presets

---

## Commands

All run from the **repository root**:

| Command | What it does |
|---|---|
| `./diffraction.sh onboard` | First-time setup wizard |
| `./diffraction.sh <name> connect` | Connect to a running sandbox |
| `./diffraction.sh <name> status` | Health check |
| `./diffraction.sh <name> logs --follow` | Live logs |
| `./diffraction.sh <name> destroy` | Remove a sandbox |
| `./diffraction.sh list` | List all sandboxes |
| `./diffraction.sh status` | Global status |
| `./diffraction.sh stop` | Stop all services |
| `./diffraction.sh uninstall` | Remove everything |

Or use npm equivalents: `npm run onboard`, `npm start`, etc.

---

## Security Model

Diffraction sandboxes use three complementary isolation mechanisms:

- **Landlock** — filesystem isolation. The agent is restricted to `/sandbox` and `/tmp`. It cannot read your SSH keys, `.env` files, or any host path.
- **seccomp** — system call filtering. Dangerous syscalls (mount, ptrace, etc.) are blocked at the kernel level.
- **Network namespaces** — default-deny egress. The agent cannot make outbound requests unless the policy file explicitly allows that domain.

Policy files live in `cli/diffraction-blueprint/policies/` and are plain YAML — reviewable by any IT or security team before deployment.

---

## Inference Options

| Option | When to use |
|---|---|
| **Diffraction Cloud** (NVIDIA API) | Fastest setup. Requires `NVIDIA_API_KEY` from [build.nvidia.com](https://build.nvidia.com) |
| **Local Ollama** | Privacy-first. Runs fully on your machine. Free. |
| **Local NIM container** | Best performance on NVIDIA GPU hardware (experimental) |
| **Local vLLM** | If you already run a vLLM server |

---

## Project Structure

```
Diffraction/
├── cli/                    ← Diffraction (this is the business)
│   ├── bin/diffraction.js  ← CLI entry point
│   ├── diffraction-blueprint/
│   │   └── policies/       ← Security policy YAML files
│   ├── scripts/            ← Setup and service scripts
│   └── Dockerfile          ← Sandbox container definition
├── agent/                  ← OpenClaw (AI agent source)
├── engine/                 ← OpenShell (secure runtime source)
├── diffraction.sh          ← Root launcher (start here)
└── package.json            ← npm entry point
```

---

## License

Apache-2.0
