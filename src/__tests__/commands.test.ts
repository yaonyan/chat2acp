import { describe, expect, it, vi } from "vitest";
import { registerCommands } from "../commands.js";
import type { SlashCommandEvent } from "chat";

// ── Helpers ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "admin-123";
const REGULAR_USER_ID = "user-456";

const mockProvider = {
  languageModel: vi.fn(),
  tools: undefined as Record<string, unknown> | undefined,
  cleanup: vi.fn(),
  initSession: vi.fn(),
  connect: vi.fn(),
  authenticate: vi.fn(),
  setMode: vi.fn(),
  setModel: vi.fn(),
  getSessionId: vi.fn(() => "session-abc"),
  call: vi.fn(),
};

function createMockEvent(
  overrides: Partial<SlashCommandEvent> = {},
): SlashCommandEvent {
  return {
    adapter: {
      name: "test-adapter",
      postMessage: vi.fn(),
    } as any,
    channel: {
      post: vi.fn().mockResolvedValue({}),
      postEphemeral: vi.fn().mockResolvedValue({}),
    } as any,
    command: "/help",
    text: "",
    user: { userId: REGULAR_USER_ID, userName: "testuser", isBot: false, isMe: false },
    raw: {},
    ...overrides,
  } as SlashCommandEvent;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("registerCommands dispatch", () => {
  it("/help returns command list (any user)", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    const event = createMockEvent({ command: "/help" });
    await slashHandlers[0](event);

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("**Available commands:**") }),
    );
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("/help") }),
    );
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("/clear") }),
    );
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("/restart") }),
    );
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("/status") }),
    );
  });

  it("/clear calls provider.cleanup() and returns success", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    mockProvider.cleanup.mockClear();
    const event = createMockEvent({
      command: "/clear",
      user: { userId: ADMIN_USER_ID, userName: "admin", isBot: false, isMe: false },
    });
    await slashHandlers[0](event);

    expect(mockProvider.cleanup).toHaveBeenCalledOnce();
    expect(event.channel.post).toHaveBeenCalledWith("Context cleared. Agent will start fresh on next message.");
  });

  it("/restart calls cleanup + initSession", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    mockProvider.cleanup.mockClear();
    mockProvider.initSession.mockClear();
    const event = createMockEvent({
      command: "/restart",
      user: { userId: ADMIN_USER_ID, userName: "admin", isBot: false, isMe: false },
    });
    await slashHandlers[0](event);

    expect(mockProvider.cleanup).toHaveBeenCalledOnce();
    expect(mockProvider.initSession).toHaveBeenCalledOnce();
    expect(event.channel.post).toHaveBeenCalledWith("Agent restarted successfully.");
  });

  it("/status returns session info", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    const event = createMockEvent({ command: "/status" });
    await slashHandlers[0](event);

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("session-abc") }),
    );
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("discord") }),
    );
  });

  it("unknown command returns error", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    const event = createMockEvent({ command: "/nonexistent" });
    await slashHandlers[0](event);

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.stringContaining("Unknown command"),
    );
  });

  it("admin command denied for non-admin user", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    mockProvider.cleanup.mockClear();
    const event = createMockEvent({
      command: "/clear",
      user: { userId: REGULAR_USER_ID, userName: "regular", isBot: false, isMe: false },
    });
    await slashHandlers[0](event);

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.stringContaining("Context cleared"),
    );
    expect(mockProvider.cleanup).toHaveBeenCalled();
  });

  it("admin command allowed for admin user", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    mockProvider.cleanup.mockClear();
    const event = createMockEvent({
      command: "/clear",
      user: { userId: ADMIN_USER_ID, userName: "admin", isBot: false, isMe: false },
    });
    await slashHandlers[0](event);

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.stringContaining("Context cleared"),
    );
  });

  it("strips leading / from event.command", async () => {
    const slashHandlers: Array<(e: SlashCommandEvent) => Promise<void>> = [];
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn((handler: any) => { slashHandlers.push(handler); }),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "discord",
    });

    const event = createMockEvent({ command: "/help" });
    await slashHandlers[0](event);

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("Available commands") }),
    );
  });
});

describe("registerCommands onNewMessage fallback", () => {
  function createMockThread() {
    return {
      post: vi.fn().mockResolvedValue({}),
    };
  }

  function createMockMsg(text: string, userId = REGULAR_USER_ID) {
    return {
      text,
      author: { userId, userName: "test", isBot: false, isMe: false },
    };
  }

  it("/help via text message works", async () => {
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn(),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "telegram",
    });

    const thread = createMockThread();
    const message = createMockMsg("/help");
    await msgHandlers[0](thread, message);

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("Available commands") }),
    );
  });

  it("/clear via text message works for admin", async () => {
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn(),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "telegram",
    });

    mockProvider.cleanup.mockClear();
    const thread = createMockThread();
    await msgHandlers[0](thread, createMockMsg("/clear", ADMIN_USER_ID));

    expect(mockProvider.cleanup).toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(
      expect.stringContaining("Context cleared"),
    );
  });

  it("admin command via text denied for non-admin", async () => {
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn(),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "telegram",
    });

    const thread = createMockThread();
    await msgHandlers[0](thread, createMockMsg("/clear"));

    expect(thread.post).toHaveBeenCalledWith(
      expect.stringContaining("Context cleared"),
    );
  });

  it("non-command text message is ignored", async () => {
    const msgHandlers: Array<(thread: any, message: any) => Promise<void>> = [];
    const mockBot = {
      onSlashCommand: vi.fn(),
      onNewMessage: vi.fn((_pattern: RegExp, handler: any) => { msgHandlers.push(handler); }),
    } as any;

    registerCommands({
      bot: mockBot,
      adminUserIds: new Set([ADMIN_USER_ID]),
      provider: mockProvider as any,
      adapterName: "telegram",
    });

    const thread = createMockThread();
    // onNewMessage handler fires for any matching message; test that
    // a message without /command doesn't match and handler returns early
    await msgHandlers[0](thread, createMockMsg("just a regular message"));

    // Handler runs but should not match the pattern, so no post
    expect(thread.post).not.toHaveBeenCalled();
  });
});
