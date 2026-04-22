# Diffract

Deploy safe, autonomous AI agents with one command.

Diffract sandboxes AI agents with kernel-level isolation (Landlock, seccomp, network namespaces), routes inference across any provider, and gives enterprises YAML-based policy control over what agents can access.

## Quick Start

```bash
# Prerequisites: Ubuntu 24.04 (Linux prod) or macOS (dev), Docker, 4+ cores, 8GB+ RAM
curl -fsSL https://raw.githubusercontent.com/hrubee/Diffraction/main/install.sh | bash
```

The installer provisions system dependencies, builds the UI, starts diffract-api and diffract-ui as systemd services (Linux), and prints a URL. Open that URL in your browser to finish setup.

To install against a custom public hostname (for auto-TLS via your reverse proxy):

```bash
DIFFRACT_DOMAIN=my.host.example curl -fsSL https://raw.githubusercontent.com/hrubee/Diffraction/main/install.sh | bash
```

## Architecture

```
Host
├── diffract CLI        → onboard, sandbox management, services
├── openshell           → sandbox runtime, L7 proxy, network policies
├── Caddy               → HTTPS reverse proxy
└── telegram-bridge     → Telegram ↔ agent relay

Sandbox (isolated k3s pod)
├── openshell-sandbox   → network namespace, L7 proxy, TLS MITM
├── diffract entrypoint → proxy env, gateway startup, security hardening
├── diffract-cli        → OpenClaw gateway + agent
└── inference.local     → routed via L7 proxy to provider API
```

## Features

**Security**
- Landlock + seccomp + network namespace isolation
- Deny-by-default network policies (YAML-based)
- L7 proxy with TLS MITM inspection
- API keys never enter the sandbox — injected by proxy at network layer
- Root-owned immutable config with SHA256 integrity hash
- Capability dropping, privilege separation (gateway/sandbox users)
- Fork bomb prevention, PATH lockdown, symlink verification

**Inference**
- 11 built-in models across NVIDIA, OpenAI, Anthropic
- Extensible model registry — add models without code changes
- Switch models at runtime: `openshell inference set --provider X --model Y`
- Privacy router: credentials stored on host, never in sandbox

**Channels**
- Web dashboard (HTTPS via Caddy)
- Telegram bot with allowlist + rate limiting
- More channels coming (Discord, Slack)

**Operations**
- One-command onboard with session resumability
- Gateway auto-restart watchdog
- Disk + memory preflight checks
- Runtime recovery diagnostics
- Skills marketplace (`diffract hub`)

## Commands

```
diffract onboard                 Interactive setup wizard
diffract list                    List all sandboxes
diffract <name> connect          Connect to sandbox shell
diffract <name> status           Show sandbox health
diffract <name> logs --follow    Stream live logs
diffract <name> destroy          Delete sandbox
diffract <name> policy-add       Add network policy preset
diffract <name> policy-list      Show applied presets
diffract model list              List available models
diffract model add <id> [prov]   Add custom model
diffract hub list                List installed skills
diffract hub install <source>    Install skill from GitHub/local
diffract hub deploy <name>       Push skill into sandbox
diffract start                   Start services (Telegram, watchdog)
diffract stop                    Stop all services
diffract status                  Show system status
```

## Telegram Integration

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export ALLOWED_CHAT_IDS="your-telegram-user-id"
diffract start
```

## Network Policies

Available presets: `discord`, `docker`, `huggingface`, `jira`, `npm`, `outlook`, `pypi`, `slack`, `telegram`

```bash
diffract my-assistant policy-add    # interactive preset selection
diffract my-assistant policy-list   # show applied presets
```

## Model Management

```bash
diffract model list                                    # 11 built-in models
diffract model add meta/llama-4-scout nvidia           # add custom
openshell inference set --provider nvidia-nim --model nvidia/nemotron-3-super-120b-a12b
```

## Built On

- [OpenShell](https://github.com/NVIDIA/OpenShell) — sandbox runtime and security engine
- [OpenClaw](https://github.com/openclaw/openclaw) — AI agent gateway and chat interface

## Documentation

See [docs/setup-guide.md](docs/setup-guide.md) for the full setup guide.

## License

[Apache-2.0](LICENSE)
