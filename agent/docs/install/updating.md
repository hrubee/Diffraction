---
summary: "Updating Diffraction safely (global install or source), plus rollback strategy"
read_when:
  - Updating Diffraction
  - Something breaks after an update
title: "Updating"
---

# Updating

Keep Diffraction up to date.

## Recommended: `diffraction update`

The fastest way to update. It detects your install type (npm or git), fetches the latest version, runs `diffraction doctor`, and restarts the gateway.

```bash
diffraction update
```

To switch channels or target a specific version:

```bash
diffraction update --channel beta
diffraction update --tag main
diffraction update --dry-run   # preview without applying
```

See [Development channels](/install/development-channels) for channel semantics.

## Alternative: re-run the installer

```bash
curl -fsSL https://diffraction.ai/install.sh | bash
```

Add `--no-onboard` to skip onboarding. For source installs, pass `--install-method git --no-onboard`.

## Alternative: manual npm or pnpm

```bash
npm i -g diffraction@latest
```

```bash
pnpm add -g diffraction@latest
```

## Auto-updater

The auto-updater is off by default. Enable it in `~/.diffraction/diffraction.json`:

```json5
{
  update: {
    channel: "stable",
    auto: {
      enabled: true,
      stableDelayHours: 6,
      stableJitterHours: 12,
      betaCheckIntervalHours: 1,
    },
  },
}
```

| Channel  | Behavior                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| `stable` | Waits `stableDelayHours`, then applies with deterministic jitter across `stableJitterHours` (spread rollout). |
| `beta`   | Checks every `betaCheckIntervalHours` (default: hourly) and applies immediately.                              |
| `dev`    | No automatic apply. Use `diffraction update` manually.                                                           |

The gateway also logs an update hint on startup (disable with `update.checkOnStart: false`).

## After updating

<Steps>

### Run doctor

```bash
diffraction doctor
```

Migrates config, audits DM policies, and checks gateway health. Details: [Doctor](/gateway/doctor)

### Restart the gateway

```bash
diffraction gateway restart
```

### Verify

```bash
diffraction health
```

</Steps>

## Rollback

### Pin a version (npm)

```bash
npm i -g diffraction@<version>
diffraction doctor
diffraction gateway restart
```

Tip: `npm view diffraction version` shows the current published version.

### Pin a commit (source)

```bash
git fetch origin
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
pnpm install && pnpm build
diffraction gateway restart
```

To return to latest: `git checkout main && git pull`.

## If you are stuck

- Run `diffraction doctor` again and read the output carefully.
- Check: [Troubleshooting](/gateway/troubleshooting)
- Ask in Discord: [https://discord.gg/clawd](https://discord.gg/clawd)
