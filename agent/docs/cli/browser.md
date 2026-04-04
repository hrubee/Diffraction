---
summary: "CLI reference for `diffraction browser` (profiles, tabs, actions, Chrome MCP, and CDP)"
read_when:
  - You use `diffraction browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "browser"
---

# `diffraction browser`

Manage Diffraction’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
diffraction browser profiles
diffraction browser --browser-profile diffraction start
diffraction browser --browser-profile diffraction open https://example.com
diffraction browser --browser-profile diffraction snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:

- `diffraction`: launches or attaches to a dedicated Diffraction-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
diffraction browser profiles
diffraction browser create-profile --name work --color "#FF5A36"
diffraction browser create-profile --name chrome-live --driver existing-session
diffraction browser delete-profile --name work
```

Use a specific profile:

```bash
diffraction browser --browser-profile work tabs
```

## Tabs

```bash
diffraction browser tabs
diffraction browser open https://docs.diffraction.ai
diffraction browser focus <targetId>
diffraction browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
diffraction browser snapshot
```

Screenshot:

```bash
diffraction browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
diffraction browser navigate https://example.com
diffraction browser click <ref>
diffraction browser type <ref> "hello"
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
diffraction browser --browser-profile user tabs
diffraction browser create-profile --name chrome-live --driver existing-session
diffraction browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
diffraction browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
