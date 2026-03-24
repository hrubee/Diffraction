# Diffraction sandbox image — Diffraction + Diffraction plugin inside OpenShell

FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        curl git ca-certificates \
        iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Create sandbox user (matches OpenShell convention)
RUN groupadd -r sandbox && useradd -r -g sandbox -d /sandbox -s /bin/bash sandbox \
    && mkdir -p /sandbox/.diffraction /sandbox/.diffraction \
    && chown -R sandbox:sandbox /sandbox

# Install Diffraction CLI (published on npm)
RUN npm install -g diffraction@2026.3.11 \
    && mv /usr/local/bin/diffraction /usr/local/bin/diffraction-cli

# Install PyYAML for blueprint runner
RUN pip3 install --break-system-packages pyyaml

# Copy our plugin and blueprint into the sandbox
COPY diffraction/dist/ /opt/diffraction/dist/
COPY diffraction/diffraction.plugin.json /opt/diffraction/
COPY diffraction/package.json /opt/diffraction/
COPY diffraction-blueprint/ /opt/diffraction-blueprint/

# Install runtime dependencies only (no devDependencies, no build step)
WORKDIR /opt/diffraction
RUN npm install --omit=dev

# Set up blueprint for local resolution
RUN mkdir -p /sandbox/.diffraction/blueprints/0.1.0 \
    && cp -r /opt/diffraction-blueprint/* /sandbox/.diffraction/blueprints/0.1.0/

# Copy startup script
COPY scripts/diffraction.sh /usr/local/bin/diffraction
RUN chmod +x /usr/local/bin/diffraction

WORKDIR /sandbox
USER sandbox

# Pre-create Diffraction directories
RUN mkdir -p /sandbox/.diffraction/agents/main/agent \
    && chmod 700 /sandbox/.diffraction

# Write diffraction.json: set nvidia as default provider, route through
# inference.local (OpenShell gateway proxy). No API key needed here —
# openshell injects credentials via the provider configuration.
RUN python3 -c "\
import json, os; \
config = { \
    'agents': {'defaults': {'model': {'primary': 'nvidia/nemotron-3-super-120b-a12b'}}}, \
    'models': {'mode': 'merge', 'providers': {'nvidia': { \
        'baseUrl': 'https://inference.local/v1', \
        'apiKey': 'openshell-managed', \
        'api': 'openai-completions', \
        'models': [{'id': 'nemotron-3-super-120b-a12b', 'name': 'NVIDIA Nemotron 3 Super 120B', 'reasoning': False, 'input': ['text'], 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}, 'contextWindow': 131072, 'maxTokens': 4096}] \
    }}} \
}; \
path = os.path.expanduser('~/.diffraction/diffraction.json'); \
json.dump(config, open(path, 'w'), indent=2); \
os.chmod(path, 0o600)"

# Install Diffraction plugin into Diffraction
RUN diffraction-cli doctor --fix > /dev/null 2>&1 || true \
    && diffraction-cli plugins install /opt/diffraction > /dev/null 2>&1 || true

ENTRYPOINT ["/bin/bash"]
CMD []
