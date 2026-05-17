import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import { generateText } from "ai";
import { Chat } from "chat";
import { createDiscordAdapter, type DiscordAdapter } from "@chat-adapter/discord";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createSlackAdapter } from "@chat-adapter/slack";
import { WeixinAdapter } from "@yaonyan/chat-adapter-weixin";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { StateAdapter } from "chat";
import type { Adapter } from "chat";
import { defaultAgent, type ACPAgentConfig } from "./agents.config.js";

// ── Chat adapter registry ──────────────────────────────────────────────────

export const CHAT_ADAPTERS = ["discord", "weixin", "telegram", "slack"] as const;
export type ChatAdapterName = (typeof CHAT_ADAPTERS)[number];

function createChatAdapter(name: ChatAdapterName): Adapter {
  switch (name) {
    case "discord":
      return createDiscordAdapter();
    case "telegram":
      return createTelegramAdapter();
    case "slack":
      return createSlackAdapter({ mode: "socket" });
    case "weixin":
      return new WeixinAdapter();
  }
}

// ── Windows command resolution ─────────────────────────────────────────────

function resolveCommand(config: ACPAgentConfig): { command: string; args: string[] } {
  if (process.platform !== "win32") {
    return { command: config.command, args: config.args };
  }
  const npmPrefix = process.env.APPDATA
    ? `${process.env.APPDATA}\\npm`
    : `${process.env.USERPROFILE}\\AppData\\Roaming\\npm`;

  if (config.command === "opencode") {
    const exe = `${npmPrefix}\\node_modules\\opencode-ai\\bin\\opencode.exe`;
    return { command: exe, args: config.args };
  }
  const script = `${npmPrefix}\\node_modules\\@tencent-ai\\codebuddy-code\\bin\\${config.command}`;
  return { command: process.execPath, args: [script, ...config.args] };
}

// ── Options ────────────────────────────────────────────────────────────────

export interface CreateBotOptions {
  adapter?: ChatAdapterName;
  provider?: ACPProvider;
  chatAdapter?: Adapter;
  state?: StateAdapter;
  command?: string;
  args?: string[];
  /** Discord only: allowed guild channels */
  allowedChannels?: string[];
}

function resolveAllowedChannels(opt?: string[]): Set<string> {
  const fromEnv = process.env.DISCORD_ALLOWED_CHANNELS
    ? process.env.DISCORD_ALLOWED_CHANNELS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return new Set([...(opt ?? []), ...fromEnv]);
}

// ── createBot ──────────────────────────────────────────────────────────────

export function createBot(opts: CreateBotOptions = {}) {
  const adapterName = opts.adapter ?? "weixin";

  // ACP provider
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
      session: { cwd: process.cwd(), mcpServers: [] },
      persistSession: agentConfig.persistSession,
      sessionDelayMs: agentConfig.sessionDelayMs,
    });

  // Chat adapter
  const chatAdapter = opts.chatAdapter ?? createChatAdapter(adapterName);

  const bot = new Chat({
    userName: "chat2acp-bot",
    adapters: { [adapterName]: chatAdapter },
    state: opts.state ?? createMemoryState(),
  });

  // ── Generic mention handler ─────────────────────────────────────────────
  const discordAdapter = adapterName === "discord" ? (chatAdapter as DiscordAdapter) : null;
  const allowedChannels = resolveAllowedChannels(opts.allowedChannels);

  bot.onNewMention(async (thread, message) => {
    // Discord channel whitelist
    if (discordAdapter) {
      const threadId = message.threadId;
      if (!discordAdapter.isDM(threadId) && allowedChannels.size > 0) {
        const { guildId, channelId } = discordAdapter.decodeThreadId(threadId);
        if (!allowedChannels.has(`${guildId}:${channelId}`)) {
          console.log(`[Discord] Ignoring message from unlisted channel: ${guildId}:${channelId}`);
          return;
        }
      }
    }

    const userText = message.text ?? "";
    console.log(`[${adapterName}] Received: ${userText}`);

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

  // ── startListening ──────────────────────────────────────────────────────
  async function startListening(signal?: AbortSignal) {
    if (adapterName === "discord" && discordAdapter) {
      await discordAdapter.startGatewayListener(
        { waitUntil: (p: Promise<unknown>) => p.catch(() => {}) },
        24 * 60 * 60 * 1000,
        signal,
      );
    }
    // Other adapters auto-start on initialize (telegram polling, slack socket, weixin polling)
  }

  return { bot, provider, chatAdapter, startListening };
}
