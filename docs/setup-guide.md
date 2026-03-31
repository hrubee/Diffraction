# Diffraction Setup Guide

Deploy safe, autonomous AI agents with one command.

## Prerequisites

| Requirement | Source | Notes |
|---|---|---|
| Linux VPS | Any provider (Hostinger, AWS, etc.) | Ubuntu 24.04, min 4 cores / 8 GB RAM / 50 GB disk |
| NVIDIA API key | [build.nvidia.com](https://build.nvidia.com) | Free tier available, starts with `nvapi-` |
| SSH access | Your VPS provider | Commands run as root |

## Installation

### 1. System Setup

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
```

### 2. Fix Docker cgroup + Install OpenShell

```bash
echo '{"default-cgroupns-mode": "host"}' > /etc/docker/daemon.json
systemctl restart docker
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
```

### 3. Install Node.js

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install 22
```

### 4. Install Diffraction

```bash
git clone --depth 1 https://github.com/your-org/Diffraction.git ~/diffract
cd ~/diffract/cli && npm install --omit=dev --ignore-scripts
chmod +x ~/diffract/diffract.sh
ln -sf ~/diffract/diffract.sh /usr/local/bin/diffract
```

### 5. Fix PATH

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.bashrc
source ~/.bashrc
```

## Onboarding

### Interactive

```bash
export NVIDIA_API_KEY="nvapi-YOUR-KEY"
diffract onboard
```

The wizard walks you through:
1. Preflight checks (Docker, disk, memory, ports)
2. Gateway deployment
3. Sandbox creation (builds secure container image)
4. AI inference provider setup
5. Model configuration
6. OpenClaw agent setup
7. Network policy presets

### Non-Interactive

```bash
export NVIDIA_API_KEY="nvapi-YOUR-KEY"
export CHAT_UI_URL="https://your-domain.com"   # optional
diffract onboard --non-interactive
```

If interrupted, re-run `diffract onboard` — it resumes from the last completed step.

## HTTPS Setup with Caddy

### 1. Install Caddy

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy -y
```

### 2. Configure

Replace `your-domain.com` with your VPS hostname:

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
your-domain.com {
    reverse_proxy 127.0.0.1:18789 {
        header_up Host 127.0.0.1:18789
        header_up Origin http://127.0.0.1:18789
    }
}
EOF
systemctl restart caddy && systemctl enable caddy
```

### 3. Open Firewall

Ensure ports **80** and **443** (TCP) are open in your VPS firewall.

## Access the Dashboard

Open `https://your-domain.com` in your browser.

Get the gateway token:

```bash
diffract my-assistant connect
python3 -c "import json; d=json.load(open('/sandbox/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])"
exit
```

## Telegram Integration

### 1. Create a Bot

- Message `@BotFather` on Telegram
- Send `/newbot`, choose a name and username
- Copy the token

### 2. Start the Bridge

```bash
export TELEGRAM_BOT_TOKEN="YOUR-TOKEN"
export ALLOWED_CHAT_IDS="YOUR-TELEGRAM-USER-ID"
diffract start
```

Get your Telegram user ID from `@userinfobot`.

### 3. Make Permanent

```bash
echo 'export TELEGRAM_BOT_TOKEN="YOUR-TOKEN"' >> ~/.bashrc
echo 'export ALLOWED_CHAT_IDS="YOUR-ID"' >> ~/.bashrc
```

## Model Management

```bash
diffract model list                          # list all available models
diffract model add meta/llama-4-scout nvidia # add a custom model
diffract model remove meta/llama-4-scout     # remove a user-added model
```

Switch the active inference model:

```bash
openshell inference set --provider nvidia-nim --model nvidia/nemotron-3-super-120b-a12b
```

## Skills Hub

```bash
diffract hub list                            # list installed skills
diffract hub install <github-url>            # install from GitHub
diffract hub deploy <skill-name>             # push into sandbox
diffract hub remove <skill-name>             # uninstall
```

## Network Policies

```bash
diffract my-assistant policy-list            # show applied presets
diffract my-assistant policy-add             # add a preset interactively
```

Available presets: `discord`, `docker`, `huggingface`, `jira`, `npm`, `outlook`, `pypi`, `slack`, `telegram`

## Command Cheatsheet

| Command | Purpose |
|---|---|
| `diffract onboard` | Interactive setup wizard |
| `diffract list` | List all sandboxes |
| `diffract my-assistant connect` | Connect to sandbox shell |
| `diffract my-assistant status` | Check sandbox health |
| `diffract my-assistant logs --follow` | Stream live logs |
| `diffract my-assistant destroy` | Delete sandbox permanently |
| `diffract start` | Start services (Telegram, watchdog) |
| `diffract stop` | Stop all services |
| `diffract status` | Show system status |
| `diffract model list` | List available models |
| `diffract hub list` | List installed skills |
| `openshell term` | Open network monitor TUI |
| `openshell inference get` | Check active model |
| `openshell provider list` | List registered providers |
| `openshell forward list` | Check port forwarding |

## Security

Diffraction sandboxes are hardened with:

- **Landlock** — filesystem access restricted to `/sandbox` + `/tmp`
- **seccomp** — syscall filtering
- **Network namespace** — deny-by-default egress, only proxy allowed
- **L7 proxy** — all HTTPS traffic inspected via MITM with ephemeral CA
- **Capability dropping** — unnecessary Linux caps removed at startup
- **Privilege separation** — gateway runs as `gateway` user, agent as `sandbox` user
- **Immutable config** — `openclaw.json` is root-owned, chmod 444, SHA256-verified
- **API key isolation** — keys stored on host, injected by proxy at network layer

## Troubleshooting

**Dashboard returns 502:**
```bash
openshell forward stop 18789 my-assistant
openshell forward start --background 18789 my-assistant
```

**Inference times out:**
```bash
openshell inference get     # verify provider is configured
openshell provider list     # verify API key is registered
```

**Sandbox not ready:**
```bash
openshell sandbox list      # check sandbox state
diffract onboard            # re-run (resumes from last step)
```

**Gateway died after pod restart:**
The watchdog auto-restarts it. If manual restart needed:
```bash
diffract start              # starts watchdog + services
```
