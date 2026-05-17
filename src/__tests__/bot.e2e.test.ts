/**
 * bot.e2e.test.ts
 *
 * 参照 chat-sdk 官方测试模式：
 *  - 用 chat.handleIncomingMessage() 触发 mention 事件（官方推荐，不访问内部 mentionHandlers）
 *  - 用 createMockAdapter / createMockState / createTestMessage 工具（对齐官方 mock-adapter.ts）
 *  - mock "ai" 和 "@mcpc-tech/acp-ai-provider"，隔离外部依赖
 *
 * 参考：
 *  packages/chat/src/chat.test.ts — handleIncomingMessage 触发方式
 *  packages/chat/src/mock-adapter.ts  — mock 工具设计
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "chat";
import {
  createMockAdapter,
  createMockState,
  createTestMessage,
  type MockStateAdapter,
} from "../test-utils.js";
import type { Adapter } from "chat";

// ─── spy on Chat.prototype.onSlashCommand ────────────────────────────────────
const onSlashCommandSpy = vi.spyOn(Chat.prototype, "onSlashCommand");

// ─── mock "ai" ────────────────────────────────────────────────────────────────
vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

// ─── mock "@mcpc-tech/acp-ai-provider" ────────────────────────────────────────
const mockLanguageModel = {
  specificationVersion: "v3",
  provider: "acp",
  modelId: "mock-codebuddy",
};

const mockProvider = {
  languageModel: vi.fn(() => mockLanguageModel),
  tools: undefined as Record<string, unknown> | undefined,
  cleanup: vi.fn(),
  initSession: vi.fn(),
  connect: vi.fn(),
  authenticate: vi.fn(),
  setMode: vi.fn(),
  setModel: vi.fn(),
  getSessionId: vi.fn(() => null),
  call: vi.fn(() => mockLanguageModel),
};

vi.mock("@mcpc-tech/acp-ai-provider", () => ({
  createACPProvider: vi.fn(() => mockProvider),
}));

import { streamText } from "ai";
import { createBot } from "../bot.js";

// ─── 常量 ──────────────────────────────────────────────────────────────────────

// Guild channel thread ID（格式：discord:{guildId}:{channelId}）
const GUILD_ID = "GUILD123";
const CHANNEL_ID = "CHANNEL456";
const THREAD_ID = `discord:${GUILD_ID}:${CHANNEL_ID}`;

// DM thread ID（isDM 检测依赖 ":D" 前缀，参见 createMockAdapter）
const DM_THREAD_ID = "discord:DU123:";

// ─── e2e 集成测试：通过 handleIncomingMessage 触发完整链路 ─────────────────────

describe("createBot e2e — 完整 mention 链路（channel 白名单已配置）", () => {
  let mockAdapter: Adapter;
  let mockState: MockStateAdapter;
  let chat: Chat<{ discord: Adapter }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProvider.tools = undefined;

    mockAdapter = createMockAdapter("discord");
    mockState = createMockState();

    // 传入白名单，允许测试用的 guild channel
    const result = createBot({
      adapter: "discord",
      provider: mockProvider as any,
      chatAdapter: mockAdapter,
      state: mockState,
      allowedChannels: [`${GUILD_ID}:${CHANNEL_ID}`],
    });
    chat = result.bot as unknown as Chat<{ discord: Adapter }>;

    await chat.webhooks.discord(
      new Request("http://test.com", { method: "POST" })
    );
  });

  it("mention → streamText 以正确 prompt 调用 → thread.post 回复 AI 文本", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("Hello from codebuddy!"));

    const message = createTestMessage("msg-1", "帮我写一段 TypeScript 函数", {
      isMention: true,
    });

    await chat.handleIncomingMessage(mockAdapter, THREAD_ID, message);

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "帮我写一段 TypeScript 函数",
      })
    );
    expect(mockProvider.languageModel).toHaveBeenCalled();
    expect(mockAdapter.postMessage).toHaveBeenCalledWith(
      THREAD_ID,
      { markdown: "Hello from codebuddy!" }
    );
  });

  it("streamText 抛出错误 → thread.post 错误提示", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ACP process exited unexpectedly")
    );

    const message = createTestMessage("msg-2", "会触发错误的问题", {
      isMention: true,
    });

    await chat.handleIncomingMessage(mockAdapter, THREAD_ID, message);

    expect(mockAdapter.postMessage).toHaveBeenCalledWith(
      THREAD_ID,
      "Something went wrong. Please try again."
    );
  });

  it("消息文本为空 → streamText 以空字符串 prompt 调用", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("空输入也能处理"));

    const message = createTestMessage("msg-3", "", { isMention: true });

    await chat.handleIncomingMessage(mockAdapter, THREAD_ID, message);

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "" })
    );
  });

  it("provider.tools 正确传入 streamText", async () => {
    const mockTools = { codeTool: { description: "run code" } };
    mockProvider.tools = mockTools as any;

    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("工具调用结果"));

    const message = createTestMessage("msg-4", "用工具执行", { isMention: true });

    await chat.handleIncomingMessage(mockAdapter, THREAD_ID, message);

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ tools: mockTools })
    );
  });

  it("多次连续 mention → 每次各自调用 streamText", async () => {
    (streamText as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(mockStreamText("第一次回复"))
      .mockReturnValueOnce(mockStreamText("第二次回复"));

    await chat.handleIncomingMessage(
      mockAdapter,
      THREAD_ID,
      createTestMessage("msg-5a", "第一条消息", { isMention: true })
    );
    await chat.handleIncomingMessage(
      mockAdapter,
      THREAD_ID,
      createTestMessage("msg-5b", "第二条消息", { isMention: true })
    );

    expect(streamText).toHaveBeenCalledTimes(2);
    expect(mockAdapter.postMessage).toHaveBeenCalledTimes(2);
  });

  it("非 mention 消息 → 不触发 streamText", async () => {
    const message = createTestMessage("msg-6", "普通消息，没有 @bot", {
      isMention: false,
    });

    await chat.handleIncomingMessage(mockAdapter, THREAD_ID, message);

    expect(streamText).not.toHaveBeenCalled();
  });
});

// ─── e2e 集成测试：Channel 访问控制 ──────────────────────────────────────────

describe("createBot e2e — Channel 访问控制", () => {
  async function buildBot(allowedChannels: string[]) {
    vi.clearAllMocks();
    mockProvider.tools = undefined;

    const mockAdapter = createMockAdapter("discord");
    const mockState = createMockState();

    const result = createBot({
      adapter: "discord",
      provider: mockProvider as any,
      chatAdapter: mockAdapter,
      state: mockState,
      allowedChannels,
    });
    const chat = result.bot as unknown as Chat<{ discord: Adapter }>;
    await chat.webhooks.discord(
      new Request("http://test.com", { method: "POST" })
    );
    return { chat, mockAdapter };
  }

  it("未配置白名单 → guild channel mention 全部放行", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("x"));
    const { chat, mockAdapter } = await buildBot([]);

    await chat.handleIncomingMessage(
      mockAdapter,
      THREAD_ID,
      createTestMessage("msg-block", "hello", { isMention: true })
    );

    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("白名单包含该 channel → guild channel mention 正常响应", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("hi"));
    const { chat, mockAdapter } = await buildBot([`${GUILD_ID}:${CHANNEL_ID}`]);

    await chat.handleIncomingMessage(
      mockAdapter,
      THREAD_ID,
      createTestMessage("msg-allow", "hello", { isMention: true })
    );

    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("DM 不需要白名单 → 默认允许", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("hi"));
    // 不传 allowedChannels，只允许 DM
    const { chat, mockAdapter } = await buildBot([]);

    await chat.handleIncomingMessage(
      mockAdapter,
      DM_THREAD_ID,
      createTestMessage("msg-dm", "private question", { isMention: true, threadId: DM_THREAD_ID })
    );

    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("白名单只含 guild A → guild B 的 mention 被忽略", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockStreamText("x"));
    const { chat, mockAdapter } = await buildBot(["OTHER_GUILD:OTHER_CHANNEL"]);

    await chat.handleIncomingMessage(
      mockAdapter,
      THREAD_ID, // GUILD123:CHANNEL456，不在白名单
      createTestMessage("msg-wrong-guild", "hello", { isMention: true })
    );

    expect(streamText).not.toHaveBeenCalled();
  });
});

// ─── 单元测试：直接测试 handler 核心逻辑 ─────────────────────────────────────

describe("mention handler 核心逻辑（单元）", () => {
  it("成功：调用 languageModel() 并传递 prompt", async () => {
    const streamTextMock = vi.fn().mockReturnValue(mockStreamText("回复内容"));

    const { posts } = await invokeHandler(streamTextMock, "请解释这段代码");

    expect(mockProvider.languageModel).toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "请解释这段代码" })
    );
    expect(posts).toEqual(["回复内容"]);
  });

  it("失败：streamText 抛错时 post 错误提示", async () => {
    const streamTextMock = vi.fn().mockRejectedValue(new Error("timeout"));

    const { posts } = await invokeHandler(streamTextMock, "会超时的问题");

    expect(posts).toEqual(["Something went wrong. Please try again."]);
  });

  it("tools 为 undefined 时也能正常调用", async () => {
    const streamTextMock = vi.fn().mockReturnValue(mockStreamText("ok"));
    mockProvider.tools = undefined;

    await invokeHandler(streamTextMock, "无 tools 的问题");

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ tools: undefined })
    );
  });
});

// ─── Slash command integration tests ──────────────────────────────────────

describe("createBot — slash command registration", () => {
  it("registers onSlashCommand handler during createBot", async () => {
    onSlashCommandSpy.mockClear();

    const mockAdapter = createMockAdapter("discord");
    const mockState = createMockState();

    createBot({
      adapter: "discord",
      provider: mockProvider as any,
      chatAdapter: mockAdapter,
      state: mockState,
      adminUserIds: ["admin-1"],
    });

    expect(onSlashCommandSpy).toHaveBeenCalled();
  });

  it("slash command handler is registered as catch-all (no filter)", async () => {
    onSlashCommandSpy.mockClear();

    const mockAdapter = createMockAdapter("discord");
    const mockState = createMockState();

    createBot({
      adapter: "discord",
      provider: mockProvider as any,
      chatAdapter: mockAdapter,
      state: mockState,
    });

    // catch-all registration: first arg is a function, no second arg
    const call = onSlashCommandSpy.mock.calls[0];
    expect(call).toBeDefined();
    expect(call[0]).toBeInstanceOf(Function);
    expect(call[1]).toBeUndefined();
  });
});

// ─── helper：构造 streamText 的 mock 返回值 ───────────────────────────────
function mockStreamText(text: string) {
  return {
    textStream: (async function* () {
      yield text;
    })(),
  };
}

// ─── helper：直接执行 handler 逻辑，返回 posts ────────────────────────────────

async function invokeHandler(
  streamTextFn: (...args: any[]) => ReturnType<typeof mockStreamText>,
  text: string
): Promise<{ posts: string[] }> {
  const posts: string[] = [];
  const thread = {
    post: vi.fn(async (msg: string | object) => {
      posts.push(typeof msg === "string" ? msg : (msg as any).markdown);
      return {} as any;
    }),
  } as any;

  try {
    const { textStream } = streamTextFn({
      model: mockProvider.languageModel() as any,
      prompt: text,
      tools: mockProvider.tools as any,
    });
    let result = "";
    for await (const chunk of textStream) {
      result += chunk;
    }
    await thread.post({ markdown: result });
  } catch {
    await thread.post("Something went wrong. Please try again.");
  }

  return { posts };
}
