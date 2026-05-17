import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import { generateText } from "ai";
import { Chat } from "chat";
import { createDiscordAdapter, type DiscordAdapter } from "@chat-adapter/discord";
import { WeixinAdapter } from "@yaonyan/chat-adapter-weixin";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { StateAdapter } from "chat";
import type { Adapter } from "chat";
import { defaultAgent, type ACPAgentConfig } from "./agents.config.js";

/**
 * On Windows, npm global `.cmd` wrappers can't be spawned without `shell: true`.
 * Instead, resolve the actual executable path directly.
 */
function resolveCommand(config: ACPAgentConfig): { command: string; args: string[] } {
  if (process.platform !== "win32") {
    return { command: config.command, args: config.args };
  }
  const npmPrefix = process.env.APPDATA
    ? `${process.env.APPDATA}\\npm`
    : `${process.env.USERPROFILE}\\AppData\\Roaming\\npm`;

  if (config.command === "opencode") {
    const script = `${npmPrefix}\\node_modules\\opencode-ai\\bin\\opencode`;
    return { command: process.execPath, args: [script, ...config.args] };
  }
  const script = `${npmPrefix}\\node_modules\\@tencent-ai\\codebuddy-code\\bin\\${config.command}`;
  return { command: process.execPath, args: [script, ...config.args] };
}

export type ChatAdapterName = "discord" | "weixin";

export interface CreateBotOptions {
  /** Which chat adapter to use. Default: "weixin". Env: CHAT_ADAPTER */
  adapter?: ChatAdapterName;
  /** override the ACP provider (useful for testing) */
  provider?: ACPProvider;
  /** override the adapter instance (useful for testing) */
  chatAdapter?: Adapter;
  /** override the state adapter (useful for testing) */
  state?: StateAdapter;
  /** ACP agent command, default from agents.config.ts */
  command?: string;
  /** ACP agent args, default from agents.config.ts */
  args?: string[];
  /**
   * Discord only: allowed guild channels in addition to DMs.
   * Format: "guildId:channelId" strings.
   * If empty, allow all channels.
   * Env: DISCORD_ALLOWED_CHANNELS (comma-separated).
   */
  allowedChannels?: string[];
}

function resolveAllowedChannels(opt?: string[]): Set<string> {
  const fromEnv = process.env.DISCORD_ALLOWED_CHANNELS
    ? process.env.DISCORD_ALLOWED_CHANNELS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return new Set([...(opt ?? []), ...fromEnv]);
}

export function createBot(opts: CreateBotOptions = {}) {
  const adapterName = opts.adapter ?? "weixin";

  // ── ACP provider ────────────────────────────────────────────────────────────
  const agentConfig: ACPAgentConfig = {
    command: opts.command ?? defaultAgent.command,
    args: opts.args ?? defaultAgent.args,
    authMethodId: defaultAgent.authMethodId,
    persistSession: defaultAgent.persistSession,
    sessionDelayMs: defaultAgent.sessionDelayMs,
  };
  const { command, args } = resolveCommand(agentConfig);
  const provider =
    opts.provider ??
    createACPProvider({
      command,
      args,
      authMethodId: agentConfig.authMethodId,
      session: {
        cwd: process.cwd(),
        mcpServers: [],
      },
      persistSession: agentConfig.persistSession,
      sessionDelayMs: agentConfig.sessionDelayMs,
    });

  // ── Chat adapter (single) ──────────────────────────────────────────────────
  let chatAdapter: Adapter;
  if (opts.chatAdapter) {
    chatAdapter = opts.chatAdapter;
  } else if (adapterName === "discord") {
    chatAdapter = createDiscordAdapter();
  } else {
    chatAdapter = new WeixinAdapter();
  }

  const bot = new Chat({
    userName: "chat2acp-bot",
    adapters: { [adapterName]: chatAdapter },
    state: opts.state ?? createMemoryState(),
  });

  // ── Mention handler ─────────────────────────────────────────────────────────
  if (adapterName === "discord") {
    const discordAdapter = chatAdapter as DiscordAdapter;
    const allowedChannels = resolveAllowedChannels(opts.allowedChannels);

    bot.onNewMention(async (thread, message) => {
      const threadId = message.threadId;

      if (!discordAdapter.isDM(threadId) && allowedChannels.size > 0) {
        const { guildId, channelId } = discordAdapter.decodeThreadId(threadId);
        const key = `${guildId}:${channelId}`;
        if (!allowedChannels.has(key)) {
          console.log(`[Discord] Ignoring message from unlisted channel: ${key}`);
          return;
        }
      }

      const userText = message.text ?? "";
      console.log(`[Discord] Received mention: ${userText}`);

      try {
        const result = await generateText({
          model: provider.languageModel() as any,
          prompt: userText,
          tools: provider.tools as any,
        });
        await thread.post(result.text);
      } catch (err) {
        console.error("[ACP] Error:", err);
        await thread.post("Something went wrong. Please try again.");
      }
    });
  } else {
    bot.onNewMention(async (thread, message) => {
      const userText = message.text ?? "";
      console.log(`[WeChat] Received message: ${userText}`);

      try {
        const result = await generateText({
          model: provider.languageModel() as any,
          prompt: userText,
          tools: provider.tools as any,
        });
        await thread.post(result.text);
      } catch (err) {
        console.error("[ACP] WeChat error:", err);
        await thread.post("Something went wrong. Please try again.");
      }
    });
  }

  // ── startListening ──────────────────────────────────────────────────────────
  async function startListening(signal?: AbortSignal) {
    if (adapterName === "discord") {
      const discordAdapter = chatAdapter as DiscordAdapter;
      await discordAdapter.startGatewayListener(
        { waitUntil: (p: Promise<unknown>) => p.catch(() => {}) },
        24 * 60 * 60 * 1000,
        signal,
      );
    }
    // WeChat adapter starts polling automatically on initialize — nothing extra needed.
  }

  return { bot, provider, chatAdapter, startListening };
}
