import type { ACPProvider } from "@mcpc-tech/acp-ai-provider";
import type { Chat, SlashCommandEvent, Thread, Message } from "chat";

// ── Command interface ──────────────────────────────────────────────────────

export interface CommandContext {
  provider: ACPProvider;
  adapterName: string;
  agentCommand: string;
  agentArgs: string[];
}

export interface Command {
  name: string;
  description: string;
  adminOnly: boolean;
  execute(ctx: CommandContext): Promise<string>;
}

// ── Built-in commands ──────────────────────────────────────────────────────

const helpCmd: Command = {
  name: "help",
  description: "Show available commands",
  adminOnly: false,
  async execute() {
    const lines = ["Available commands:"];
    for (const cmd of builtinCommands) {
      const adminTag = cmd.adminOnly ? " (admin)" : "";
      lines.push(`- /${cmd.name} — ${cmd.description}${adminTag}`);
    }
    return lines.join("\n");
  },
};

const clearCmd: Command = {
  name: "clear",
  description: "Clear ACP agent conversation context",
  adminOnly: true,
  async execute(ctx) {
    ctx.provider.cleanup();
    return "Context cleared. Agent will start fresh on next message.";
  },
};

const restartCmd: Command = {
  name: "restart",
  description: "Restart the ACP agent process",
  adminOnly: true,
  async execute(ctx) {
    ctx.provider.cleanup();
    await ctx.provider.initSession();
    return "Agent restarted successfully.";
  },
};

const statusCmd: Command = {
  name: "status",
  description: "Show current ACP agent session info",
  adminOnly: false,
  async execute(ctx) {
    const sessionId = ctx.provider.getSessionId();
    const agent = `${ctx.agentCommand} ${ctx.agentArgs.join(" ")}`.trim();
    return [
      `== Agent Status ==`,
      `Agent: ${agent}`,
      `Adapter: ${ctx.adapterName}`,
      `Session: ${sessionId ?? "none"}`,
    ].join("\n");
  },
};

const builtinCommands: Command[] = [helpCmd, clearCmd, restartCmd, statusCmd];

// ── Shared command dispatch ────────────────────────────────────────────────

function makeDispatch(opts: {
  commandMap: Map<string, Command>;
  adminUserIds: Set<string>;
  provider: ACPProvider;
  adapterName: string;
  agentCommand: string;
  agentArgs: string[];
}) {
  return async function dispatch(name: string, userId: string | undefined) {
    const cmd = opts.commandMap.get(name);
    if (!cmd) {
      return `Unknown command \`/${name}\`. Type \`/help\` to see available commands.`;
    }
    if (cmd.adminOnly && userId && !opts.adminUserIds.has(userId)) {
      console.log(`[${opts.adapterName}] Non-admin user "${userId}" attempted /${name}, but check disabled — allowing`);
    }
    console.log(`[${opts.adapterName}] /${name} by ${userId ?? "unknown"}`);
    const ctx: CommandContext = {
      provider: opts.provider,
      adapterName: opts.adapterName,
      agentCommand: opts.agentCommand,
      agentArgs: opts.agentArgs,
    };
    return cmd.execute(ctx);
  };
}

// ── Registration ───────────────────────────────────────────────────────────

const TEXT_COMMAND_PATTERN = /^\/(\w+)/;

export function registerCommands(opts: {
  bot: Chat;
  commands?: Command[];
  adminUserIds: Set<string>;
  provider: ACPProvider;
  adapterName: string;
  agentCommand?: string;
  agentArgs?: string[];
}) {
  const commands = opts.commands ?? builtinCommands;
  const commandMap = new Map(commands.map((c) => [c.name, c]));
  const dispatch = makeDispatch({
    commandMap,
    adminUserIds: opts.adminUserIds,
    provider: opts.provider,
    adapterName: opts.adapterName,
    agentCommand: opts.agentCommand ?? "",
    agentArgs: opts.agentArgs ?? [],
  });

  // Native slash commands (Discord, Slack)
  opts.bot.onSlashCommand(async (event: SlashCommandEvent) => {
    const name = event.command.startsWith("/")
      ? event.command.slice(1)
      : event.command;
    const response = await dispatch(name, event.user.userId);
    await event.channel.post(response);
  });

  // Text-based fallback (Telegram, WeChat) — matches /command in plain messages
  opts.bot.onNewMessage(TEXT_COMMAND_PATTERN, async (thread: Thread, message: Message) => {
    console.log(`[${opts.adapterName}] onNewMessage matched: "${message.text}"`);
    const match = (message.text ?? "").match(TEXT_COMMAND_PATTERN);
    if (!match) return;
    const name = match[1];
    const response = await dispatch(name, message.author?.userId);
    await thread.post(response);
  });

  console.log(
    `[${opts.adapterName}] Commands registered: ${commands.map((c) => c.name).join(", ")}`,
  );

  /**
   * Try to dispatch a command from raw text. Returns the response string
   * if the text was a command, or null if it was not. Call this inside
   * onNewMention handlers to handle /command when the SDK auto-promotes
   * DM messages to mentions (preventing onNewMessage from firing).
   */
  async function tryDispatchText(text: string, userId: string | undefined): Promise<string | null> {
    const match = (text ?? "").trim().match(TEXT_COMMAND_PATTERN);
    if (!match) return null;
    return dispatch(match[1], userId);
  }

  return { tryDispatchText };
}

// ── Platform command sync ──────────────────────────────────────────────────

/**
 * Register slash commands with the platform so users get auto-complete UI.
 * Call after bot.initialize() during startup.
 *
 * - Telegram: POST setMyCommands to the Bot API
 * - Discord: commands must be registered via Discord REST API separately
 *   (PUT /applications/{appId}/commands) — not handled here yet
 * - Slack: commands are configured in the Slack App UI — no API needed
 * - WeChat: no slash command concept
 */
export async function syncPlatformCommands(opts: {
  adapterName: string;
  commands?: Command[];
}) {
  const commands = opts.commands ?? builtinCommands;

  if (opts.adapterName === "telegram") {
    const payload = commands.map((c) => ({
      command: c.name,
      description: c.description,
    }));
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn("[commands] TELEGRAM_BOT_TOKEN not set, skipping setMyCommands");
      return;
    }
    const url = `https://api.telegram.org/bot${token}/setMyCommands`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: payload }),
      });
      if (!res.ok) {
        console.warn(
          `[commands] setMyCommands failed: ${res.status} ${await res.text()}`,
        );
      } else {
        console.log(
          `[commands] Telegram commands synced: ${payload.map((c) => c.command).join(", ")}`,
        );
      }
    } catch (err) {
      console.warn("[commands] setMyCommands error:", err);
    }
  }

  // Discord: register application commands via REST API
  if (opts.adapterName === "discord") {
    const appId = process.env.DISCORD_APPLICATION_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!appId || !botToken) {
      console.warn("[commands] DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN not set, skipping command registration");
      return;
    }
    const url = `https://discord.com/api/v10/applications/${appId}/commands`;
    const payload = commands.map((c) => ({
      name: c.name,
      description: c.description,
    }));
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(
          `[commands] Discord command registration failed: ${res.status} ${await res.text()}`,
        );
      } else {
        console.log(
          `[commands] Discord commands synced: ${payload.map((c) => c.name).join(", ")}`,
        );
      }
    } catch (err) {
      console.warn("[commands] Discord command registration error:", err);
    }
  }
}

export { builtinCommands };
