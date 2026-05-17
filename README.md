# chat2acp

Bridge any chat platform to any [ACP](https://github.com/anthropics/acp)-compatible AI agent, powered by [`@mcpc-tech/acp-ai-provider`](https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider) + [chat SDK](https://chat-sdk.dev).

Currently supported platforms:

- **Discord** — via [`@chat-adapter/discord`](https://chat-sdk.dev/adapters/for/discord)
- **WeChat** — via [`@yaonyan/chat-adapter-weixin`](https://github.com/yaonyan/chat-adapter-weixin)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Create a `.env` file or export:

```bash
# ── Discord ──
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_PUBLIC_KEY=your-application-public-key
DISCORD_APPLICATION_ID=your-application-id
# Optional: restrict to specific guild channels (guildId:channelId, comma-separated)
# DISCORD_ALLOWED_CHANNELS=
# Optional: trigger on role mentions
# DISCORD_MENTION_ROLE_IDS=1234567890

# ── WeChat (optional) ──
# WEIXIN_BOT_TOKEN=your-weixin-bot-token
# WEIXIN_BOT_USER_ID=your-weixin-user-id
```

### 3. Build & Run

```bash
# Build
pnpm build

# Start
pnpm start

# Development (watch mode)
pnpm dev
```

## How it works

1. `@mcpc-tech/acp-ai-provider` spawns any ACP-compatible agent as a child process and exposes it as an AI SDK `LanguageModelV3`.
2. Chat adapters (Discord, WeChat, etc.) listen for mentions/messages via the Chat SDK.
3. When the bot is mentioned, the message is forwarded to the agent via `generateText()` and the response is posted back.

## Requirements

- An ACP-compatible CLI agent installed and authenticated
- Node.js >= 18
- pnpm
