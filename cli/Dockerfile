# Diffract sandbox image — Diffract agent inside secure sandbox
#
# Security model (mirrors NemoClaw):
#   - gateway user runs the OpenClaw gateway (cannot be killed by sandbox user)
#   - sandbox user runs agent commands
#   - openclaw.json is root-owned read-only (chmod 444) with SHA256 integrity hash
#   - .openclaw-data holds writable state, reached via symlinks from .openclaw
#   - Capabilities dropped at entrypoint via capsh
#   - Build tools removed to reduce attack surface

FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime deps + security tools (pinned versions for reproducibility)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        curl git ca-certificates \
        iproute2 \
        iptables \
        libcap2-bin \
        gosu \
    && rm -rf /var/lib/apt/lists/*

# Harden: remove unnecessary build tools and network probes
RUN (apt-get remove --purge -y gcc gcc-12 g++ g++-12 cpp cpp-12 make \
        netcat-openbsd netcat-traditional ncat 2>/dev/null || true) \
    && apt-get autoremove --purge -y 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

# Create gateway and sandbox users for privilege separation.
# The gateway runs as 'gateway' so the 'sandbox' user (agent) cannot
# kill it or restart it with a tampered HOME/config.
RUN groupadd -r gateway && useradd -r -g gateway -d /sandbox -s /usr/sbin/nologin gateway \
    && groupadd -r sandbox && useradd -r -g sandbox -d /sandbox -s /bin/bash sandbox \
    && mkdir -p /sandbox \
    && chown -R sandbox:sandbox /sandbox

# Install Hermes Agent CLI and white-label as Diffract CLI
ARG HERMES_VERSION=latest
RUN pip3 install --break-system-packages "git+https://github.com/NousResearch/hermes-agent.git" \
    && if [ -f /usr/local/bin/hermes ]; then mv /usr/local/bin/hermes /usr/local/bin/diffract-cli; \
       else ln -s $(command -v hermes) /usr/local/bin/diffract-cli; fi \
    && find /usr/local/lib/python3.*/dist-packages/hermes_cli -type f -name "*.py" -exec sed -i 's/⚕ Hermes Agent Status/⚕ Diffract Agent Status/g' {} + \
    && find /usr/local/lib/python3.*/dist-packages/hermes_cli -type f -name "*.py" -exec sed -i "s/Run 'hermes/Run 'diffract/g" {} + \
    && find /usr/local/lib/python3.*/dist-packages/hermes_cli -type f -name "*.py" -exec sed -i 's/Hermes Agent/Diffract Agent/g' {} +

# Install PyYAML for blueprint runner
RUN pip3 install --break-system-packages pyyaml

# Bake Playwright + Chromium headless shell into the image at build time.
# Runtime install is not possible: the sandbox deny-by-default policy blocks
# cdn.playwright.dev. The binary is copied to /opt/chromium-headless so that
# the sandbox user (drwx------) can access it without hitting /root/.cache.
RUN npm install -g playwright@latest \
    && npx playwright install chromium-headless-shell \
    && npx playwright install-deps chromium \
    && CHROME=$(find /root/.cache/ms-playwright -name chrome-headless-shell -type f 2>/dev/null | head -1) \
    && [ -n "$CHROME" ] || { echo "ERROR: chrome-headless-shell not found after playwright install" >&2; ls -R /root/.cache/ms-playwright 2>&1 | head -40 >&2; exit 1; } \
    && CHROME_DIR="$(dirname "$CHROME")" \
    && cp -r "$CHROME_DIR" /opt/chromium-headless \
    && chmod -R 755 /opt/chromium-headless

# Copy plugin and policies into the sandbox
# These are staged into the build context by onboard.js
COPY diffract/dist/ /opt/diffract/dist/
COPY diffract/diffract.plugin.json /opt/diffract/
COPY diffract/package.json /opt/diffract/
COPY policies/ /opt/policies/
COPY blueprints/ /opt/blueprints/

# Install runtime dependencies only
WORKDIR /opt/diffract
RUN npm install --omit=dev

# Set up blueprints for local resolution
RUN mkdir -p /sandbox/.diffract/blueprints/0.1.0 \
    && cp -r /opt/blueprints/* /sandbox/.diffract/blueprints/0.1.0/

# Copy startup script
COPY scripts/diffract-sandbox-entry.sh /usr/local/bin/diffract
RUN chmod +x /usr/local/bin/diffract

# ── Directory structure: immutable config + writable state ───────
# .hermes/ is locked read-only (Landlock + DAC). Writable state lives
# in .hermes-data, reached via symlinks so Hermes finds them.
RUN mkdir -p /sandbox/.hermes-data/agents/main/agent \
        /sandbox/.hermes-data/extensions \
        /sandbox/.hermes-data/workspace \
        /sandbox/.hermes-data/skills \
        /sandbox/.hermes-data/hooks \
        /sandbox/.hermes-data/identity \
        /sandbox/.hermes-data/devices \
        /sandbox/.hermes-data/canvas \
        /sandbox/.hermes-data/cron \
        /sandbox/.hermes-data/logs \
        /sandbox/.hermes-data/completions \
        /sandbox/.hermes-data/sessions \
    && mkdir -p /sandbox/.hermes \
    && ln -s /sandbox/.hermes-data/agents /sandbox/.hermes/agents \
    && ln -s /sandbox/.hermes-data/extensions /sandbox/.hermes/extensions \
    && ln -s /sandbox/.hermes-data/workspace /sandbox/.hermes/workspace \
    && ln -s /sandbox/.hermes-data/skills /sandbox/.hermes/skills \
    && ln -s /sandbox/.hermes-data/hooks /sandbox/.hermes/hooks \
    && ln -s /sandbox/.hermes-data/identity /sandbox/.hermes/identity \
    && ln -s /sandbox/.hermes-data/devices /sandbox/.hermes/devices \
    && ln -s /sandbox/.hermes-data/canvas /sandbox/.hermes/canvas \
    && ln -s /sandbox/.hermes-data/cron /sandbox/.hermes/cron \
    && ln -s /sandbox/.hermes-data/logs /sandbox/.hermes/logs \
    && ln -s /sandbox/.hermes-data/completions /sandbox/.hermes/completions \
    && ln -s /sandbox/.hermes-data/sessions /sandbox/.hermes/sessions \
    && touch /sandbox/.hermes-data/update-check.json \
    && ln -s /sandbox/.hermes-data/update-check.json /sandbox/.hermes/update-check.json \
    && mkdir -p /sandbox/.diffract/agents/main/agent \
    && chown -R sandbox:sandbox /sandbox/.hermes /sandbox/.hermes-data /sandbox/.diffract

# ── Build args for config that varies per deployment ─────────────
# SECURITY: Promote build-args to env vars so the Python script reads
# them via os.environ, never via string interpolation (code injection vector).
ARG DIFFRACT_MODEL=nvidia/nemotron-3-super-120b-a12b
ARG DIFFRACT_PROVIDER_KEY=nvidia
ARG DIFFRACT_PRIMARY_MODEL_REF=nvidia/nemotron-3-super-120b-a12b
ARG DIFFRACT_INFERENCE_BASE_URL=https://inference.local/v1
ARG DIFFRACT_INFERENCE_API=openai-completions
ARG CHAT_UI_URL=http://127.0.0.1:18789
ARG DIFFRACT_BUILD_ID=default

ENV DIFFRACT_MODEL=${DIFFRACT_MODEL} \
    DIFFRACT_PROVIDER_KEY=${DIFFRACT_PROVIDER_KEY} \
    DIFFRACT_PRIMARY_MODEL_REF=${DIFFRACT_PRIMARY_MODEL_REF} \
    DIFFRACT_INFERENCE_BASE_URL=${DIFFRACT_INFERENCE_BASE_URL} \
    DIFFRACT_INFERENCE_API=${DIFFRACT_INFERENCE_API} \
    CHAT_UI_URL=${CHAT_UI_URL}

WORKDIR /sandbox
USER sandbox

# Write the COMPLETE hermes.json including gateway config and auth token.
# This file is immutable at runtime (root-owned, chmod 444).
# Build args customize per deployment. Auth token is generated per build.
RUN python3 -c "\
import json, os, secrets; \
from urllib.parse import urlparse; \
model = os.environ['DIFFRACT_MODEL']; \
provider_key = os.environ['DIFFRACT_PROVIDER_KEY']; \
primary_ref = os.environ['DIFFRACT_PRIMARY_MODEL_REF']; \
base_url = os.environ['DIFFRACT_INFERENCE_BASE_URL']; \
api = os.environ['DIFFRACT_INFERENCE_API']; \
chat_ui = os.environ.get('CHAT_UI_URL', 'http://127.0.0.1:18789'); \
parsed = urlparse(chat_ui); \
chat_origin = f'{parsed.scheme}://{parsed.netloc}' if parsed.scheme and parsed.netloc else 'http://127.0.0.1:18789'; \
origins = list(dict.fromkeys(['http://127.0.0.1:18789', chat_origin])); \
config = { \
    'agents': {'defaults': {'model': {'primary': primary_ref}}}, \
    'models': {'mode': 'merge', 'providers': { \
        provider_key: { \
            'baseUrl': base_url, \
            'apiKey': 'unused', \
            'api': api, \
            'models': [{'id': model, 'name': primary_ref, 'reasoning': False, 'input': ['text'], 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}, 'contextWindow': 131072, 'maxTokens': 4096}] \
        } \
    }}, \
    'channels': {'defaults': {'configWrites': False}}, \
    'gateway': { \
        'mode': 'local', \
        'controlUi': {'allowInsecureAuth': True, 'dangerouslyDisableDeviceAuth': True, 'allowedOrigins': origins}, \
        'trustedProxies': ['127.0.0.1', '::1'], \
        'auth': {'token': secrets.token_hex(24)} \
    } \
}; \
oc = os.path.expanduser('~/.hermes/hermes.json'); \
df = os.path.expanduser('~/.diffract/diffract.json'); \
json.dump(config, open(oc, 'w'), indent=2); os.chmod(oc, 0o600); \
json.dump(config, open(df, 'w'), indent=2); os.chmod(df, 0o600)"

# Install Diffract plugin
RUN diffract-cli doctor --fix > /dev/null 2>&1 || true \
    && diffract-cli plugins install /opt/diffract > /dev/null 2>&1 || true

# ── Config permissions ──────────────────────────────────────────
# Allow the sandbox user to modify hermes.json and .env via the setup wizard.
USER root
RUN chown -R sandbox:sandbox /sandbox/.hermes /sandbox/.diffract

# Entrypoint runs as root to drop capabilities and start the gateway
# as the gateway user, then drops to sandbox for agent commands.
ENTRYPOINT ["/usr/local/bin/diffract"]
CMD ["/bin/bash"]
