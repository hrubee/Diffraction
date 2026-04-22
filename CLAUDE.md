# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Diffract is an enterprise platform for deploying sandboxed AI agents. It combines kernel-level isolation (Landlock, seccomp, network namespaces), multi-provider inference routing, and YAML-based policy control. Built on top of NVIDIA OpenShell (sandbox runtime) and OpenClaw (agent gateway).

The `Reference/` directory contains full upstream copies of OpenShell, OpenClaw, and related projects. Always consult it for implementation details — the project is largely built and the more context you have, the better.

## System Requirements

- **OS**: Ubuntu 24.04 (production), macOS (development)
- **Runtime**: Node.js >= 20, Rust 1.88+
- **Infra**: Docker, 4+ CPU cores, 8GB+ RAM

## Build & Development Commands

### CLI (Node.js — the primary interface)

```bash
cd cli && npm install                    # install deps
cd cli && node --test test/*.test.js     # run all unit tests
cd cli && node --test test/<name>.test.js # run a single test
node -c cli/bin/diffract.js              # syntax check
```

### UI (Next.js 16 / React 19 dashboard)

```bash
cd ui && npm install
cd ui && npm run dev                     # dev server
cd ui && npm run build                   # production build
```

### Rust crates

```bash
cargo build                              # build all crates
cargo test                               # run all tests
cargo clippy                             # lint (pedantic + nursery enabled)
```

### Docs (Sphinx + MyST)

```bash
cd cli && make docs                      # build HTML docs
cd cli && make docs-strict               # build with warnings-as-errors
cd cli && make docs-live                  # live reload preview
```

### Linting & Formatting

```bash
cd cli && make check                     # lint TS + Python
cd cli && make format                    # auto-format
bash -n scripts/*.sh                     # shell script syntax check
```

### Security tests (CI runs these)

```bash
cd cli && node --test test/security-binaries-restriction.test.js
cd cli && node --test test/security-c2-dockerfile-injection.test.js
cd cli && node --test test/security-c4-manifest-traversal.test.js
cd cli && node --test test/credential-exposure.test.js
```

### Running Diffract locally

```bash
./diffract.sh onboard                    # interactive setup wizard
./diffract.sh list                       # list sandboxes
./diffract.sh <name> connect             # shell into sandbox
./diffract.sh doctor                     # system diagnostics
```

## Architecture

### Six major layers

| Directory     | Tech                  | Role                                                                                                                                                                           |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli/`      | Node.js               | Main `diffract` CLI — onboarding, sandbox CRUD, model management, skills hub, Telegram bridge                                                                               |
| `crates/`   | Rust                  | `diffract-bootstrap` (deployment/Docker/PKI), `diffract-policy` (policy engine ~11K LOC), `diffract-router` (inference routing), `diffract-tui` (terminal UI ~24K LOC) |
| `ui/`       | Next.js 16 / React 19 | Enterprise web dashboard with WebSocket gateway connection                                                                                                                     |
| `agent/`    | Node.js + Swift       | Multi-channel AI assistant runtime (20+ messaging platforms)                                                                                                                   |
| `policies/` | YAML                  | Deny-by-default network/filesystem/process policies with service presets                                                                                                       |
| `deploy/`   | Helm/Docker/k8s       | Kubernetes StatefulSet, Dockerfiles, cluster entrypoints                                                                                                                       |

### How the pieces connect

```
User → diffract CLI (cli/bin/diffract.js)
         ↓
     OpenShell runtime (sandbox creation, L7 proxy, network policies)
         ↓
     Sandbox (isolated k3s pod)
       ├── Agent (OpenClaw gateway on port 18789)
       ├── Network namespace (deny-by-default, L7 proxy with TLS MITM)
       └── Inference route → Provider API (NVIDIA/OpenAI/Anthropic/Ollama)
```

### Security model (critical to understand)

- **Deny-by-default**: All outbound network access is blocked unless explicitly allowed by a policy YAML
- **API keys never enter the sandbox**: Stored on host, injected by the L7 proxy at the network layer
- **L7 inspection**: The proxy terminates TLS, inspects HTTP method/path, enforces per-binary restrictions
- **Policy presets**: `policies/presets/*.yaml` — pre-built rules for common services (Slack, Jira, npm, etc.)
- **Approval flow**: When an agent tries to reach an unlisted host, OpenShell blocks it; the TUI (`openshell term`) displays the blocked request for operator approval (session-scoped only)

### CLI structure (`cli/`)

Entry point: `cli/bin/diffract.js` (~827 lines) — routes all commands.

Key library modules in `cli/bin/lib/`:

- `onboard.js` — 7-step interactive setup wizard with session resumability
- `registry.js` — multi-sandbox registry at `~/.diffract/sandboxes.json`
- `credentials.js` — credential storage at `~/.diffract/credentials.json` (mode 600)
- `policies.js` — policy preset management, applies presets via `openshell policy set`
- `model-registry.js` — extensible model registry (built-in `cli/models.json` + user `~/.diffract/models.json`)
- `hub.js` — skills marketplace at `~/.diffract/skills/`
- `nim.js` — NVIDIA NIM container management
- `local-inference.js` — Ollama/vLLM local provider setup
- `runtime-recovery.js` — diagnostics and recovery guidance

### Rust crates (`crates/`)

10 workspace crates (Rust edition 2024, MSRV 1.88):

- `diffract-bootstrap` — Gateway deployment, Docker orchestration (via bollard), PKI/mTLS cert generation, error diagnosis engine with actionable recovery steps
- `diffract-cli` — Rust CLI binary (clap-based)
- `diffract-core` — Shared types and utilities
- `diffract-gateway` — Gateway server logic
- `diffract-ocsf` — OCSF (Open Cybersecurity Schema Framework) audit event formatting
- `diffract-policy` — Policy DSL parsing and validation from YAML, settings management (global + sandbox-scoped), audit trail
- `diffract-providers` — Inference provider abstractions
- `diffract-router` — Inference request routing with protocol-aware dispatch (OpenAI/Anthropic formats), provider auth injection, mock routes for testing
- `diffract-sandbox` — Sandbox lifecycle management
- `diffract-tui` — Ratatui-based terminal UI with multi-pane dashboard, policy draft approval, log viewer, sandbox management

### Proto/gRPC contracts (`proto/`)

- `diffract.proto` — Main service: sandbox CRUD, provider management, policy operations, draft recommendations, log streaming
- `sandbox.proto` — Policy schema: filesystem/network/process rules with L7 HTTP method/path constraints

### Key scripts (`scripts/`)

- `diffract-sandbox-entry.sh` — Security-hardened sandbox entrypoint (capability dropping, fork bomb prevention, PATH lockdown, config integrity via SHA256, proxy setup)
- `gateway-watchdog.sh` — Health monitor with auto-restart (3 consecutive failures → restart)
- `telegram-bridge.js` — Telegram bot with per-chat rate limiting, polling with backoff
- `sync-upstream.sh` — Pulls from OpenShell + OpenClaw + Diffraction repos with renames

### UI architecture (`ui/`)

Next.js 16 app with cookie-based auth. WebSocket connection to gateway at `/gateway-ws`. Pages: chat, dashboard, models, policies, skills, settings. API routes bridge to CLI commands via `cli-bridge.ts`. Important: Next.js 16 has breaking changes from training data — read `node_modules/next/dist/docs/` before modifying.

### Multi-upstream sync

This repo aggregates three upstream projects via `scripts/sync-upstream.sh` (runs daily in CI):

- **OpenShell** → `crates/`, `proto/`, `deploy/`, `docs/`
- **OpenClaw** → `agent/`
- **Diffraction CLI** → `cli/`, `policies/`

Renames are applied: openshell→diffract, openclaw→diffract, diffraction→diffract.

### Configuration (`diffract.yaml`)

Main config file with sections for gateway (listen address, TLS, data_dir), provider definitions, inference routing, agent blueprints, and enterprise features (RBAC, OCSF audit). See `diffract.yaml.example` for the full schema. Agent blueprints live in `blueprints/`.

### Environment variables (`agent/.env.example`)

The agent runtime supports env vars for: gateway auth (`GATEWAY_TOKEN`), provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.), messaging channels (Telegram, Discord, Slack, WhatsApp), and optional tools (Brave Search, Perplexity, Firecrawl, ElevenLabs).

## Naming conventions

- **Diffract** (capital D) in prose, docs, UI headings
- **diffract** (lowercase) for CLI command, package name, paths, config keys
- **NVIDIA** always all caps
- **OpenShell** camelCase (not Openshell, Open Shell)
- Use American English spelling

## Documentation style

- Active voice, present tense, no hedge words ("simply," "just," "easily")
- CLI commands in code blocks with `$` prompt prefix
- One sentence per line in markdown source
- MyST admonitions (:::{tip}, :::{note}) for callouts
- No emoji in technical prose

<!-- mulch:start -->

## Project Expertise (Mulch)

<!-- mulch-onboard-v:1 -->

This project uses [Mulch](https://github.com/jayminwest/mulch) for structured expertise management.

**At the start of every session**, run:

```bash
mulch prime
```

This injects project-specific conventions, patterns, decisions, and other learnings into your context.
Use `mulch prime --files src/foo.ts` to load only records relevant to specific files.

**Before completing your task**, review your work for insights worth preserving — conventions discovered,
patterns applied, failures encountered, or decisions made — and record them:

```bash
mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
```

Link evidence when available: `--evidence-commit <sha>`, `--evidence-bead <id>`

Run `mulch status` to check domain health and entry counts.
Run `mulch --help` for full usage.
Mulch write commands use file locking and atomic writes — multiple agents can safely record to the same domain concurrently.

### Before You Finish

1. Discover what to record:
   ```bash
   mulch learn
   ```
2. Store insights from this work session:
   ```bash
   mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
   ```
3. Validate and commit:
   ```bash
   mulch sync
   ```

<!-- mulch:end -->

<!-- seeds:start -->

## Issue Tracking (Seeds)

<!-- seeds-onboard-v:1 -->

This project uses [Seeds](https://github.com/jayminwest/seeds) for git-native issue tracking.

**At the start of every session**, run:

```
sd prime
```

This injects session context: rules, command reference, and workflows.

**Quick reference:**

- `sd ready` — Find unblocked work
- `sd create --title "..." --type task --priority 2` — Create issue
- `sd update <id> --status in_progress` — Claim work
- `sd close <id>` — Complete work
- `sd dep add <id> <depends-on>` — Add dependency between issues
- `sd sync` — Sync with git (run before pushing)

### Before You Finish

1. Close completed issues: `sd close <id>`
2. File issues for remaining work: `sd create --title "..."`
3. Sync and push: `sd sync && git push`

<!-- seeds:end -->
