---
summary: "Run Diffraction in a rootless Podman container"
read_when:
  - You want a containerized gateway with Podman instead of Docker
title: "Podman"
---

# Podman

Run the Diffraction Gateway in a **rootless** Podman container. Uses the same image as Docker (built from the repo [Dockerfile](https://github.com/diffraction/diffraction/blob/main/Dockerfile)).

## Prerequisites

- **Podman** (rootless mode)
- **sudo** access for one-time setup (creating the dedicated user and building the image)

## Quick start

<Steps>
  <Step title="One-time setup">
    From the repo root, run the setup script. It creates a dedicated `diffraction` user, builds the container image, and installs the launch script:

    ```bash
    ./scripts/podman/setup.sh
    ```

    This also creates a minimal config at `~diffraction/.diffraction/diffraction.json` (sets `gateway.mode` to `"local"`) so the Gateway can start without running the wizard.

    By default the container is **not** installed as a systemd service -- you start it manually in the next step. For a production-style setup with auto-start and restarts, pass `--quadlet` instead:

    ```bash
    ./scripts/podman/setup.sh --quadlet
    ```

    (Or set `DIFFRACTION_PODMAN_QUADLET=1`. Use `--container` to install only the container and launch script.)

    **Optional build-time env vars** (set before running `scripts/podman/setup.sh`):

    - `DIFFRACTION_DOCKER_APT_PACKAGES` -- install extra apt packages during image build.
    - `DIFFRACTION_EXTENSIONS` -- pre-install extension dependencies (space-separated names, e.g. `diagnostics-otel matrix`).

  </Step>

  <Step title="Start the Gateway">
    For a quick manual launch:

    ```bash
    ./scripts/run-diffraction-podman.sh launch
    ```

  </Step>

  <Step title="Run the onboarding wizard">
    To add channels or providers interactively:

    ```bash
    ./scripts/run-diffraction-podman.sh launch setup
    ```

    Then open `http://127.0.0.1:18789/` and use the token from `~diffraction/.diffraction/.env` (or the value printed by setup).

  </Step>
</Steps>

## Systemd (Quadlet, optional)

If you ran `./scripts/podman/setup.sh --quadlet` (or `DIFFRACTION_PODMAN_QUADLET=1`), a [Podman Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit is installed so the gateway runs as a systemd user service for the diffraction user. The service is enabled and started at the end of setup.

- **Start:** `sudo systemctl --machine diffraction@ --user start diffraction.service`
- **Stop:** `sudo systemctl --machine diffraction@ --user stop diffraction.service`
- **Status:** `sudo systemctl --machine diffraction@ --user status diffraction.service`
- **Logs:** `sudo journalctl --machine diffraction@ --user -u diffraction.service -f`

The quadlet file lives at `~diffraction/.config/containers/systemd/diffraction.container`. To change ports or env, edit that file (or the `.env` it sources), then `sudo systemctl --machine diffraction@ --user daemon-reload` and restart the service. On boot, the service starts automatically if lingering is enabled for diffraction (setup does this when loginctl is available).

To add quadlet **after** an initial setup that did not use it, re-run: `./scripts/podman/setup.sh --quadlet`.

## The diffraction user (non-login)

`scripts/podman/setup.sh` creates a dedicated system user `diffraction`:

- **Shell:** `nologin` — no interactive login; reduces attack surface.
- **Home:** e.g. `/home/diffraction` — holds `~/.diffraction` (config, workspace) and the launch script `run-diffraction-podman.sh`.
- **Rootless Podman:** The user must have a **subuid** and **subgid** range. Many distros assign these automatically when the user is created. If setup prints a warning, add lines to `/etc/subuid` and `/etc/subgid`:

  ```text
  diffraction:100000:65536
  ```

  Then start the gateway as that user (e.g. from cron or systemd):

  ```bash
  sudo -u diffraction /home/diffraction/run-diffraction-podman.sh
  sudo -u diffraction /home/diffraction/run-diffraction-podman.sh setup
  ```

- **Config:** Only `diffraction` and root can access `/home/diffraction/.diffraction`. To edit config: use the Control UI once the gateway is running, or `sudo -u diffraction $EDITOR /home/diffraction/.diffraction/diffraction.json`.

## Environment and config

- **Token:** Stored in `~diffraction/.diffraction/.env` as `DIFFRACTION_GATEWAY_TOKEN`. `scripts/podman/setup.sh` and `run-diffraction-podman.sh` generate it if missing (uses `openssl`, `python3`, or `od`).
- **Optional:** In that `.env` you can set provider keys (e.g. `GROQ_API_KEY`, `OLLAMA_API_KEY`) and other Diffraction env vars.
- **Host ports:** By default the script maps `18789` (gateway) and `18790` (bridge). Override the **host** port mapping with `DIFFRACTION_PODMAN_GATEWAY_HOST_PORT` and `DIFFRACTION_PODMAN_BRIDGE_HOST_PORT` when launching.
- **Gateway bind:** By default, `run-diffraction-podman.sh` starts the gateway with `--bind loopback` for safe local access. To expose on LAN, set `DIFFRACTION_GATEWAY_BIND=lan` and configure `gateway.controlUi.allowedOrigins` (or explicitly enable host-header fallback) in `diffraction.json`.
- **Paths:** Host config and workspace default to `~diffraction/.diffraction` and `~diffraction/.diffraction/workspace`. Override the host paths used by the launch script with `DIFFRACTION_CONFIG_DIR` and `DIFFRACTION_WORKSPACE_DIR`.

## Storage model

- **Persistent host data:** `DIFFRACTION_CONFIG_DIR` and `DIFFRACTION_WORKSPACE_DIR` are bind-mounted into the container and retain state on the host.
- **Ephemeral sandbox tmpfs:** if you enable `agents.defaults.sandbox`, the tool sandbox containers mount `tmpfs` at `/tmp`, `/var/tmp`, and `/run`. Those paths are memory-backed and disappear with the sandbox container; the top-level Podman container setup does not add its own tmpfs mounts.
- **Disk growth hotspots:** the main paths to watch are `media/`, `agents/<agentId>/sessions/sessions.json`, transcript JSONL files, `cron/runs/*.jsonl`, and rolling file logs under `/tmp/diffraction/` (or your configured `logging.file`).

`scripts/podman/setup.sh` now stages the image tar in a private temp directory and prints the chosen base dir during setup. For non-root runs it accepts `TMPDIR` only when that base is safe to use; otherwise it falls back to `/var/tmp`, then `/tmp`. The saved tar stays owner-only and is streamed into the target user’s `podman load`, so private caller temp dirs do not block setup.

## Useful commands

- **Logs:** With quadlet: `sudo journalctl --machine diffraction@ --user -u diffraction.service -f`. With script: `sudo -u diffraction podman logs -f diffraction`
- **Stop:** With quadlet: `sudo systemctl --machine diffraction@ --user stop diffraction.service`. With script: `sudo -u diffraction podman stop diffraction`
- **Start again:** With quadlet: `sudo systemctl --machine diffraction@ --user start diffraction.service`. With script: re-run the launch script or `podman start diffraction`
- **Remove container:** `sudo -u diffraction podman rm -f diffraction` — config and workspace on the host are kept

## Troubleshooting

- **Permission denied (EACCES) on config or auth-profiles:** The container defaults to `--userns=keep-id` and runs as the same uid/gid as the host user running the script. Ensure your host `DIFFRACTION_CONFIG_DIR` and `DIFFRACTION_WORKSPACE_DIR` are owned by that user.
- **Gateway start blocked (missing `gateway.mode=local`):** Ensure `~diffraction/.diffraction/diffraction.json` exists and sets `gateway.mode="local"`. `scripts/podman/setup.sh` creates this file if missing.
- **Rootless Podman fails for user diffraction:** Check `/etc/subuid` and `/etc/subgid` contain a line for `diffraction` (e.g. `diffraction:100000:65536`). Add it if missing and restart.
- **Container name in use:** The launch script uses `podman run --replace`, so the existing container is replaced when you start again. To clean up manually: `podman rm -f diffraction`.
- **Script not found when running as diffraction:** Ensure `scripts/podman/setup.sh` was run so that `run-diffraction-podman.sh` is copied to diffraction’s home (e.g. `/home/diffraction/run-diffraction-podman.sh`).
- **Quadlet service not found or fails to start:** Run `sudo systemctl --machine diffraction@ --user daemon-reload` after editing the `.container` file. Quadlet requires cgroups v2: `podman info --format '{{.Host.CgroupsVersion}}'` should show `2`.

## Optional: run as your own user

To run the gateway as your normal user (no dedicated diffraction user): build the image, create `~/.diffraction/.env` with `DIFFRACTION_GATEWAY_TOKEN`, and run the container with `--userns=keep-id` and mounts to your `~/.diffraction`. The launch script is designed for the diffraction-user flow; for a single-user setup you can instead run the `podman run` command from the script manually, pointing config and workspace to your home. Recommended for most users: use `scripts/podman/setup.sh` and run as the diffraction user so config and process are isolated.
