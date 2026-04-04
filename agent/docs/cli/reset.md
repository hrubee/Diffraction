---
summary: "CLI reference for `diffraction reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `diffraction reset`

Reset local config/state (keeps the CLI installed).

```bash
diffraction backup create
diffraction reset
diffraction reset --dry-run
diffraction reset --scope config+creds+sessions --yes --non-interactive
```

Run `diffraction backup create` first if you want a restorable snapshot before removing local state.
