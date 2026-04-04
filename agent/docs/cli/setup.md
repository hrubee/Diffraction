---
summary: "CLI reference for `diffraction setup` (initialize config + workspace)"
read_when:
  - You’re doing first-run setup without full CLI onboarding
  - You want to set the default workspace path
title: "setup"
---

# `diffraction setup`

Initialize `~/.diffraction/diffraction.json` and the agent workspace.

Related:

- Getting started: [Getting started](/start/getting-started)
- CLI onboarding: [Onboarding (CLI)](/start/wizard)

## Examples

```bash
diffraction setup
diffraction setup --workspace ~/.diffraction/workspace
```

To run onboarding via setup:

```bash
diffraction setup --wizard
```
