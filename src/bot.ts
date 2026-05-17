import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import { generateText } from "ai";
import { Chat } from "chat";
import { createDiscordAdapter, type DiscordAdapter } from "@chat-adapter/discord";
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
  // Resolve the actual .exe to avoid .cmd wrapper spawn issues
  const npmPrefix = process.env.APPDATA
    ? `${process.env.APPDATA}\\npm`
    : `${process.env.USERPROFILE}\\AppData\\Roaming\\npm`;

  if (config.command === "opencode") {
    const exe = `${npmPrefix}\\node_modules\\opencode-ai\\bin\\opencode.exe`;
    return { command: exe, args: config.args };
  }
  // Fallback: spawn via node for script-based packages
  const script = `${npmPrefix}\\node_modules\\@tencent-ai\\codebuddy-code\\bin\\${config.command}`;
  return { command: process.execPath, args: [script, ...config.args] };
}

export interface CreateBotOptions {
  /** override the ACP provider (useful for testing) */
  provider?: ACPProvider;
  /** override the Discord adapter (useful for testing) */
  discordAdapter?: Adapter;
  /** override the WeChat adapter (disabled by default; pass an adapter to enable) */
  weixinAdapter?: Adapter | null;
  /** override the state adapter (useful for testing) */
  state?: StateAdapter;
  /** ACP agent command, default from agents.config.ts ("opencode") */
  command?: string;
  /** ACP agent args, default from agents.config.ts (["acp"]) */
  args?: string[];
  /**
   * Allowed guild channels in addition to DMs.
   * Format: "guildId:channelId" strings.
   * If empty, only DMs are allowed (default).
   * Can also be set via DISCORD_ALLOWED_CHANNELS env var (comma-separated).
   */
  allowedChannels?: string[];
}

/**
 * Parse allowed channels from env var or options.
 * Format: "guildId:channelId,guildId:channelId,..."
 */
function resolveAllowedChannels(opt?: string[]): Set<string> {
  const fromEnv = process.env.DISCORD_ALLOWED_CHANNELS
    ? process.env.DISCORD_ALLOWED_CHANNELS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return new Set([...(opt ?? []), ...fromEnv]);
}

export function createBot(opts: CreateBotOptions = {}) {
  const allowedChannels = resolveAllowedChannels(opts.allowedChannels);

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

  const discordAdapter = (opts.discordAdapter ?? createDiscordAdapter()) as DiscordAdapter;

  const adapters: Record<string, Adapter> = { discord: discordAdapter };
  if (opts.weixinAdapter) adapters.weixin = opts.weixinAdapter;

  const bot = new Chat({
    userName: "chat2acp-bot",
    adapters,
    state: opts.state ?? createMemoryState(),
  });

  // ── Discord mention handler ──────────────────────────────────────────────────
  bot.onNewMention(async (thread, message) => {
    // Only handle Discord messages in this handler
    if (thread.adapter.name !== "discord") return;

    const threadId = message.threadId;

    // Channel whitelist: if configured, only allow listed guild channels.
    // If empty/not set, allow all channels.
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateText({
        model: provider.languageModel() as any,
        prompt: userText,
        tools: provider.tools as any,
      });
      await thread.post(result.text);
    } catch (err) {
      console.error("[ACP] Error:", err);
      await thread.post("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  });

  return { bot, provider, discordAdapter };
}
