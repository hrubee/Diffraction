---
summary: "CLI reference for `diffraction uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `diffraction uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
diffraction backup create
diffraction uninstall
diffraction uninstall --all --yes
diffraction uninstall --dry-run
```

Run `diffraction backup create` first if you want a restorable snapshot before removing state or workspaces.
