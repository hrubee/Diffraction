---
title:
  page: "Set Up the Diffraction Telegram Bridge for Remote Agent Chat"
  nav: "Set Up Telegram Bridge"
description: "Forward messages between Telegram and the sandboxed Diffraction agent."
keywords: ["diffraction telegram bridge", "telegram bot diffraction agent"]
topics: ["generative_ai", "ai_agents"]
tags: ["diffraction", "openshell", "telegram", "deployment", "diffraction"]
content:
  type: how_to
  difficulty: intermediate
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Set Up the Telegram Bridge

Forward messages between a Telegram bot and the Diffraction agent running inside the sandbox.
The Telegram bridge is an auxiliary service managed by `diffraction start`.

## Prerequisites

- A running Diffraction sandbox, either local or remote.
- A Telegram bot token from [BotFather](https://t.me/BotFather).

## Create a Telegram Bot

Open Telegram and send `/newbot` to [@BotFather](https://t.me/BotFather).
Follow the prompts to create a bot and receive a bot token.

## Set the Environment Variable

Export the bot token as an environment variable:

```console
$ export TELEGRAM_BOT_TOKEN=<your-bot-token>
```

## Start Auxiliary Services

Start the Telegram bridge and other auxiliary services:

```console
$ diffraction start
```

The `start` command launches the following services:

- The Telegram bridge forwards messages between Telegram and the agent.
- The cloudflared tunnel provides external access to the sandbox.

The Telegram bridge starts only when the `TELEGRAM_BOT_TOKEN` environment variable is set.

## Verify the Services

Check that the Telegram bridge is running:

```console
$ diffraction status
```

The output shows the status of all auxiliary services.

## Send a Message

Open Telegram, find your bot, and send a message.
The bridge forwards the message to the Diffraction agent inside the sandbox and returns the agent response.

## Restrict Access by Chat ID

To restrict which Telegram chats can interact with the agent, set the `ALLOWED_CHAT_IDS` environment variable to a comma-separated list of Telegram chat IDs:

```console
$ export ALLOWED_CHAT_IDS="123456789,987654321"
$ diffraction start
```

## Stop the Services

To stop the Telegram bridge and all other auxiliary services:

```console
$ diffraction stop
```

## Related Topics

- [Deploy Diffraction to a Remote GPU Instance](deploy-to-remote-gpu.md) for remote deployment with Telegram support.
- [Commands](../reference/commands.md) for the full `start` and `stop` command reference.
