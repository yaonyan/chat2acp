# chat2acp

Bridge any chat platform to any [ACP](https://github.com/anthropics/acp)-compatible AI agent, powered by [`@mcpc-tech/acp-ai-provider`](https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider) + [Chat SDK](https://chat-sdk.dev).

## Supported platforms

| Platform | `CHAT_ADAPTER` | Package |
|---|---|---|
| Discord | `discord` | `@chat-adapter/discord` |
| Telegram | `telegram` | `@chat-adapter/telegram` |
| Slack | `slack` | `@chat-adapter/slack` |
| WeChat | `weixin` | `@yaonyan/chat-adapter-weixin` |

## Quick start

```bash
pnpm install
cp .env.example .env   # edit: set CHAT_ADAPTER + credentials
pnpm dev               # watchdog → bot (hot reload + crash recovery)
```

## How it works

1. **Chat adapter** listens for @-mentions/messages on the configured platform
2. **ACP provider** spawns an ACP agent (default: OpenCode) as a child process, exposing it as an AI SDK language model
3. **Mention → generateText → reply**: the user message is forwarded to the agent, the response is posted back

## Architecture

```
Watchdog (src/watchdog.ts)
  └─ Bot (src/index.ts)
       ├─ Chat Adapter  ←  Discord / Telegram / Slack / WeChat
       ├─ ACP Provider  ←  spawns OpenCode via JSON-RPC over stdio
       └─ Mention Handler → generateText() → reply
```

See **[AGENTS.md](AGENTS.md)** for the full architecture, file map, and design rationale.

## Setup

### 1. Install & configure

```bash
pnpm install
cp .env.example .env
```

Edit `.env` — pick a platform and set credentials (see `.env.example` for all options).

### 2. Run

```bash
pnpm dev      # dev with hot reload + crash recovery (watchdog)
pnpm build    # production build
pnpm start    # production run (no watchdog)
pnpm test     # run tests
```

## Requirements

- An ACP-compatible CLI agent (OpenCode, CodeBuddy, Claude, etc.)
- Node.js >= 18
- pnpm
