import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import { generateText } from "ai";
import { Chat } from "chat";
import { createDiscordAdapter, type DiscordAdapter } from "@chat-adapter/discord";
import { WeixinAdapter } from "@yaonyan/chat-adapter-weixin";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { StateAdapter } from "chat";
import type { Adapter } from "chat";

/**
 * On Windows, npm global `.cmd` wrappers can't be spawned without `shell: true`.
 * Instead, resolve the actual node script path and spawn `node <script>` directly.
 */
function resolveCommand(agentCmd = "codebuddy"): { command: string; extraArgs: string[] } {
  if (process.platform !== "win32") {
    return { command: agentCmd, extraArgs: [] };
  }
  const npmPrefix = process.env.APPDATA
    ? `${process.env.APPDATA}\\npm`
    : `${process.env.USERPROFILE}\\AppData\\Roaming\\npm`;
  const script = `${npmPrefix}\\node_modules\\@tencent-ai\\codebuddy-code\\bin\\${agentCmd}`;
  return { command: process.execPath, extraArgs: [script] };
}

export interface CreateBotOptions {
  /** override the ACP provider (useful for testing) */
  provider?: ACPProvider;
  /** override the Discord adapter (useful for testing) */
  discordAdapter?: Adapter;
  /** override the WeChat adapter (useful for testing; pass null to disable) */
  weixinAdapter?: Adapter | null;
  /** override the state adapter (useful for testing) */
  state?: StateAdapter;
  /** ACP agent command, default "codebuddy" */
  command?: string;
  /** ACP agent args, default ["--acp"] */
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

  const { command: defaultCommand, extraArgs } = resolveCommand(opts.command);
  const provider =
    opts.provider ??
    createACPProvider({
      command: defaultCommand,
      args: [...extraArgs, ...(opts.args ?? ["--acp"])],
      authMethodId: "iOA",
      session: {
        cwd: process.cwd(),
        mcpServers: [],
      },
      persistSession: true,
    });

  const discordAdapter = (opts.discordAdapter ?? createDiscordAdapter()) as DiscordAdapter;

  // weixinAdapter: explicit null disables it; otherwise always enabled (reads env vars by default)
  const weixinAdapter =
    opts.weixinAdapter === null
      ? null
      : opts.weixinAdapter != null
        ? (opts.weixinAdapter as WeixinAdapter)
        : new WeixinAdapter();

  const adapters: Record<string, Adapter> = { discord: discordAdapter };
  if (weixinAdapter) adapters.weixin = weixinAdapter;

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
    // If empty/not set, allow all channels (like WeChat adapter).
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

  // ── WeChat mention handler ───────────────────────────────────────────────────
  if (weixinAdapter) {
    bot.onNewMention(async (thread, message) => {
      // Only handle WeChat messages in this handler
      if (thread.adapter.name !== "weixin") return;

      const userText = message.text ?? "";
      console.log(`[WeChat] Received message: ${userText}`);

      try {
        console.log("[WeChat] Calling generateText...");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await generateText({
          model: provider.languageModel() as any,
          prompt: userText,
          tools: provider.tools as any,
        });
        console.log(`[WeChat] generateText done, reply: ${result.text.slice(0, 80)}`);
        try {
          await thread.post(result.text);
          console.log("[WeChat] thread.post done");
        } catch (postErr) {
          console.error("[WeChat] thread.post error:", postErr);
        }
      } catch (err) {
        console.error("[ACP] WeChat error:", err);
        await thread.post("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    });
  }

  return { bot, provider, discordAdapter };
}
