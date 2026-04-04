---
summary: "CLI reference for `diffraction logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `diffraction logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
diffraction logs
diffraction logs --follow
diffraction logs --json
diffraction logs --limit 500
diffraction logs --local-time
diffraction logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
