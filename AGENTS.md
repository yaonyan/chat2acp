# AGENTS.md — chat2acp

Grounding document for AI agents working on this codebase. Read this first.

## What this project does

chat2acp bridges any **chat platform** (Discord, Telegram, Slack, WeChat) to any **ACP-compatible AI agent** (OpenCode, Claude, etc.). When a user @-mentions the bot, their message is forwarded to the AI agent via `generateText()`, and the response is posted back.

## Architecture

```
Chat Platform (Discord/Telegram/Slack/WeChat)
    │
    ▼
Chat SDK (`chat` package)  ←  handles messages, mentions, threads
    │
    ▼
@chat-adapter/*  ←  platform-specific adapter (reads env vars, auto-connects)
    │
    ▼
bot.ts `onNewMention`  ←  single generic handler for all platforms
    │
    ▼
generateText() from `ai` SDK  ←  uses ACP provider as the language model
    │
    ▼
@mcpc-tech/acp-ai-provider  ←  spawns ACP agent as child process, JSON-RPC 2.0 over stdio
    │
    ▼
OpenCode / CodeBuddy / Claude  ←  the actual AI agent (ACP subprocess)
```

## Files — what each does

| File | Role |
|------|------|
| `src/watchdog.ts` | **Parent process** — spawns bot, watches `src/` for changes, hot reloads, auto-restarts on crash. This is what `pnpm dev` runs. |
| `src/index.ts` | **Bot process** — reads `CHAT_ADAPTER` env var, creates bot, starts listening, prints `CHAT2ACP_READY` to signal watchdog. |
| `src/bot.ts` | **Bot factory** — `createBot()` builds the ACP provider, chat adapter, and mention handler. Exports `CHAT_ADAPTERS` registry and `CreateBotOptions`. |
| `src/agents.config.ts` | **Agent config** — defines `ACPAgentConfig` interface and `defaultAgent` (OpenCode with `opencode acp` args). |
| `src/__tests__/bot.e2e.test.ts` | **Integration tests** — mocks `ai` + `@mcpc-tech/acp-ai-provider`, tests mention handler via `chat.handleIncomingMessage()`. |
| `src/test-utils.ts` | **Test helpers** — `createMockAdapter`, `createMockState`, `createTestMessage`. |

## Adapters — how to switch

Set `CHAT_ADAPTER` in `.env`:

| `CHAT_ADAPTER` | Package | Auto-start | Key env vars |
|---|---|---|---|
| `discord` | `@chat-adapter/discord` | Gateway (websocket) | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` |
| `telegram` | `@chat-adapter/telegram` | Long polling | `TELEGRAM_BOT_TOKEN` |
| `slack` | `@chat-adapter/slack` | Socket mode | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` |
| `weixin` | `@yaonyan/chat-adapter-weixin` | Long polling | `WEIXIN_BOT_TOKEN`, `WEIXIN_BASE_URL` |

To add a new adapter:
1. Add to `CHAT_ADAPTERS` array in `bot.ts`
2. Add a `case` in `createChatAdapter()`
3. Add env vars to `.env.example`

## Watchdog — how hot reload works

```
watchdog (src/watchdog.ts)  ──spawns──>  bot (src/index.ts)
     │                                        │
     ├─ fs.watch("src/", recursive)           ├─ prints CHAT2ACP_READY when ready
     ├─ on change (800ms debounce):           ├─ SIGTERM → exit within 3s
     │   1. spawn NEW bot                     └─ crash (non-zero exit) → restarted by watchdog
     │   2. wait for CHAT2ACP_READY (15s)
     │   3a. ready → SIGTERM old, keep new
     │   3b. timeout → SIGKILL new, keep old (rollback)
     └─ on unexpected child exit → restart after 2s
```

Key behaviors:
- **PID file** (`.chat2acp.pid`) prevents duplicate watchdogs
- **Rollback**: new code fails → old bot stays running, zero downtime
- **Auto-recover**: bot crashes → 2s → restarted automatically

## ACP agent — default config

Default agent is **OpenCode** (`opencode acp`). Configured in `src/agents.config.ts`:

```ts
export const defaultAgent: ACPAgentConfig = {
  command: "opencode",
  args: ["acp"],
  persistSession: true,
  // authMethodId omitted — auto-detect from agent
};
```

On Windows, `resolveCommand()` translates `opencode` → `opencode-ai/bin/opencode.exe` to avoid `.cmd` wrapper spawn issues.

## Dev workflow

```bash
pnpm install            # install deps
cp .env.example .env    # configure credentials + CHAT_ADAPTER
pnpm dev                # start watchdog → bot (hot reload enabled)
pnpm test               # run 13 e2e + unit tests
pnpm build              # production build (tsup → dist/)
pnpm start              # production run (node dist/index.js, no watchdog)
```

## Key patterns

- **Single adapter**: one at a time. `CHAT_ADAPTER` env var picks which.
- **Generic handler**: all adapters share one `onNewMention` handler. Discord-only logic (channel whitelist, `decodeThreadId`) is gated behind `if (discordAdapter)`.
- **Config as TS**: `agents.config.ts` uses TypeScript (not JSON) so fields can have comments and JSDoc references.
- **Test isolation**: tests mock `ai` + `@mcpc-tech/acp-ai-provider` via `vi.mock()`, no real agent spawned.

## Dependencies

| Package | Purpose |
|---------|---------|
| `chat` | Chat SDK — `Chat` class, `onNewMention`, `Adapter` interface |
| `@chat-adapter/*` | Platform adapters for Discord, Telegram, Slack |
| `@yaonyan/chat-adapter-weixin` | WeChat adapter |
| `@mcpc-tech/acp-ai-provider` | Bridges ACP protocol to AI SDK v6 `LanguageModelV3` |
| `ai` | Vercel AI SDK — `generateText()` |
| `@chat-adapter/state-memory` | In-memory session state (dev/testing) |
| `dotenv` | Loads `.env` into `process.env` |

## References

- ACP Registry: https://agentclientprotocol.com/get-started/registry
- ACP Spec: https://agentclientprotocol.com/specification
- Chat SDK: https://chat-sdk.dev
- Chat SDK Slash Commands: https://chat-sdk.dev/docs/slash-commands
- Discord Adapter: https://chat-sdk.dev/adapters/discord
- OpenCode: https://opencode.ai
