# syntax=docker/dockerfile:1
# Diffract E2E test image
#
# Builds the Next.js UI, installs Playwright with Chromium, and runs the
# full e2e suite against the locally-started UI server.  All /api/* calls
# are intercepted by Playwright route mocking — no OpenShell runtime or real
# NVIDIA credentials are required.
#
# Build:
#   docker build -f e2e/Dockerfile -t diffract-e2e .
#
# Run:
#   docker run --rm diffract-e2e
#
# Pass a real base URL to test against an already-running server:
#   docker run --rm -e E2E_BASE_URL=http://host.docker.internal:3000 diffract-e2e

FROM node:20-bookworm-slim

# System deps for Chromium (Playwright installs its own browser binary)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      libnss3 \
      libnspr4 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libdbus-1-3 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libasound2 \
      libpango-1.0-0 \
      libcairo2 \
      libatspi2.0-0 \
      libx11-xcb1 \
      libxcb-dri3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install UI dependencies ────────────────────────────────────────────────────
COPY ui/package.json ui/package-lock.json* ./ui/
RUN cd ui && npm ci --omit=dev

# ── Copy UI source and build ───────────────────────────────────────────────────
COPY ui/ ./ui/
RUN cd ui && npm run build

# ── Install Playwright + e2e dependencies ─────────────────────────────────────
# Root package.json declares @playwright/test as a devDependency.
COPY package.json package-lock.json* ./
RUN npm ci
RUN npx playwright install chromium --with-deps

# ── Copy e2e tests ─────────────────────────────────────────────────────────────
COPY e2e/ ./e2e/

# ── Entrypoint ─────────────────────────────────────────────────────────────────
# 1. Start the Next.js production server in the background.
# 2. Wait for it to be ready.
# 3. Run Playwright tests pointing at it.
CMD ["sh", "-c", "\
  cd /app/ui && npx next start --port 3000 & \
  echo 'Waiting for UI server...' && \
  for i in $(seq 1 30); do \
    curl -sf http://localhost:3000 > /dev/null 2>&1 && break || sleep 2; \
  done && \
  echo 'UI server ready.' && \
  cd /app && E2E_BASE_URL=http://localhost:3000 npx playwright test --config=e2e/playwright.config.ts \
"]
