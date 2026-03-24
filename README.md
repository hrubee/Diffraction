# Diffraction

**Enterprise AI Agent Framework** — a unified system combining autonomous agent intelligence, secure sandbox execution, and orchestration into a single deployable stack.

Built on top of Openclaw (agent core), NemoClaw (orchestration CLI), and OpenShell (secure container runtime).

---

## Requirements

| Tool | Minimum version |
|------|----------------|
| [Node.js](https://nodejs.org) | v20 or later |
| [Docker Desktop](https://www.docker.com/products/docker-desktop) | Latest stable |

---

## Quick Start (anyone, any machine)

### 1 — Clone the repo

```bash
git clone https://github.com/hrubee/Diffraction.git
cd Diffraction
```

### 2 — Run the onboarding wizard

**Option A — shell script (recommended)**
```bash
chmod +x diffraction.sh   # only needed once
./diffraction.sh onboard
```

**Option B — npm**
```bash
npm install
npm run onboard
```

**Option C — node directly**
```bash
npm install
node cli/bin/diffraction.js onboard
```

The wizard will guide you through:
- Setting up your AI provider (NVIDIA NIM, Ollama, OpenAI-compatible)
- Launching the secure OpenShell gateway
- Creating and naming your AI sandbox
- Deploying your first agent

---

## Day-to-day Commands

All commands work from the **repository root**:

| Shell script | npm | What it does |
|---|---|---|
| `./diffraction.sh` | `npm start` | Show help |
| `./diffraction.sh onboard` | `npm run onboard` | First-time setup wizard |
| `./diffraction.sh status` | `npm run status` | Check active sandbox |
| `./diffraction.sh stop` | `npm run stop` | Stop the running sandbox |
| `./diffraction.sh list` | `npm run list` | List all sandboxes |
| `./diffraction.sh uninstall` | `npm run uninstall` | Remove everything |

---

## Project Structure

```
Diffraction/
├── agent/          # Autonomous agent core (Openclaw)
├── cli/            # Orchestration CLI and onboarding (NemoClaw)
├── engine/         # Secure container runtime (OpenShell)
├── dashboard/      # Web UI
├── diffraction.sh  # ← Run this from any machine
└── package.json    # ← Or use npm commands
```

---

## License

Apache-2.0
