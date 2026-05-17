/**
 * 测试工具文件 —— 参照 chat-sdk 官方 packages/chat/src/mock-adapter.ts 的模式
 *
 * 提供：
 *  - createMockAdapter()   带完整 vi.fn() 打桩的 Adapter mock
 *  - createMockState()     带真实内存语义的 StateAdapter mock（非空 stub）
 *  - createTestMessage()   测试消息工厂（含完整 MessageData 字段）
 */
import { vi } from "vitest";
import {
  Message,
  parseMarkdown,
  type Adapter,
  type FormattedContent,
  type Lock,
  type Logger,
  type MessageData,
  type QueueEntry,
  type StateAdapter,
} from "chat";

// ─── Logger ──────────────────────────────────────────────────────────────────

export const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger,
};

// ─── Mock Adapter ─────────────────────────────────────────────────────────────

/**
 * 创建功能完整的 mock Adapter。
 * 所有方法均为 vi.fn()，postMessage / editMessage 等有合理的默认返回值。
 */
export function createMockAdapter(name = "discord"): Adapter {
  return {
    name,
    userName: `${name}-bot`,
    initialize: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    handleWebhook: vi.fn().mockResolvedValue(new Response("ok")),
    postMessage: vi
      .fn()
      .mockResolvedValue({ id: "msg-1", threadId: undefined, raw: {} }),
    editMessage: vi
      .fn()
      .mockResolvedValue({ id: "msg-1", threadId: undefined, raw: {} }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    addReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    startTyping: vi.fn().mockResolvedValue(undefined),
    fetchMessages: vi
      .fn()
      .mockResolvedValue({ messages: [], nextCursor: undefined }),
    fetchThread: vi
      .fn()
      .mockResolvedValue({ id: "t1", channelId: "c1", metadata: {} }),
    fetchMessage: vi.fn().mockResolvedValue(null),
    encodeThreadId: vi.fn(
      (data: { channel: string; thread: string }) =>
        `${name}:${data.channel}:${data.thread}`
    ),
    // Discord threadId format: discord:{guildId}:{channelId}[:{threadId}]
    decodeThreadId: vi.fn((id: string) => {
      const parts = id.split(":");
      // parts[0] = adapter name (e.g. "discord"), parts[1] = guildId, parts[2] = channelId
      return { guildId: parts[1], channelId: parts[2], threadId: parts[3] };
    }),
    parseMessage: vi.fn(),
    renderFormatted: vi.fn((_content: FormattedContent) => "formatted"),
    openDM: vi
      .fn()
      .mockImplementation((userId: string) =>
        Promise.resolve(`${name}:D${userId}:`)
      ),
    isDM: vi
      .fn()
      .mockImplementation((threadId: string) => threadId.includes(":D")),
    getChannelVisibility: vi.fn().mockReturnValue("unknown"),
    openModal: vi.fn().mockResolvedValue({ viewId: "V123" }),
    channelIdFromThreadId: vi
      .fn()
      .mockImplementation((threadId: string) =>
        threadId.split(":").slice(0, 2).join(":")
      ),
    fetchChannelMessages: vi
      .fn()
      .mockResolvedValue({ messages: [], nextCursor: undefined }),
    listThreads: vi
      .fn()
      .mockResolvedValue({ threads: [], nextCursor: undefined }),
    fetchChannelInfo: vi.fn().mockImplementation((channelId: string) =>
      Promise.resolve({
        id: channelId,
        name: `#${channelId}`,
        isDM: false,
        metadata: {},
      })
    ),
    postChannelMessage: vi
      .fn()
      .mockResolvedValue({ id: "msg-1", threadId: undefined, raw: {} }),
  } satisfies Adapter;
}

// ─── Mock State ───────────────────────────────────────────────────────────────

export interface MockStateAdapter extends StateAdapter {
  /** 直接访问内部 cache，用于断言 */
  cache: Map<string, unknown>;
}

/**
 * 创建带真实内存语义的 StateAdapter mock。
 *
 * 与空 stub 不同，acquireLock / setIfNotExists / subscribe 等方法
 * 有真实的互斥逻辑，可以测试并发竞态场景。
 */
export function createMockState(): MockStateAdapter {
  const subscriptions = new Set<string>();
  const locks = new Map<string, Lock>();
  const cache = new Map<string, unknown>();
  const queues = new Map<string, QueueEntry[]>();

  return {
    cache,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),

    subscribe: vi.fn().mockImplementation(async (id: string) => {
      subscriptions.add(id);
    }),
    unsubscribe: vi.fn().mockImplementation(async (id: string) => {
      subscriptions.delete(id);
    }),
    isSubscribed: vi.fn().mockImplementation(async (id: string) => {
      return subscriptions.has(id);
    }),

    acquireLock: vi
      .fn()
      .mockImplementation(async (threadId: string, ttlMs: number) => {
        if (locks.has(threadId)) return null;
        const lock: Lock = {
          threadId,
          token: "test-token",
          expiresAt: Date.now() + ttlMs,
        };
        locks.set(threadId, lock);
        return lock;
      }),
    forceReleaseLock: vi.fn().mockImplementation(async (threadId: string) => {
      locks.delete(threadId);
    }),
    releaseLock: vi.fn().mockImplementation(async (lock: Lock) => {
      locks.delete(lock.threadId);
    }),
    extendLock: vi.fn().mockResolvedValue(true),

    get: vi.fn().mockImplementation(async (key: string) => {
      return cache.get(key) ?? null;
    }),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      cache.set(key, value);
    }),
    setIfNotExists: vi
      .fn()
      .mockImplementation(async (key: string, value: unknown) => {
        if (cache.has(key)) return false;
        cache.set(key, value);
        return true;
      }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      cache.delete(key);
    }),

    appendToList: vi
      .fn()
      .mockImplementation(
        async (
          key: string,
          value: unknown,
          options?: { maxLength?: number; ttlMs?: number }
        ) => {
          let list = (cache.get(key) as unknown[]) ?? [];
          list = [...list, value];
          if (options?.maxLength && list.length > options.maxLength) {
            list = list.slice(list.length - options.maxLength);
          }
          cache.set(key, list);
        }
      ),
    getList: vi.fn().mockImplementation(async (key: string) => {
      return (cache.get(key) as unknown[]) ?? [];
    }),

    enqueue: vi
      .fn()
      .mockImplementation(
        async (threadId: string, entry: QueueEntry, maxSize: number) => {
          let queue = queues.get(threadId) ?? [];
          queue = [...queue, entry];
          if (queue.length > maxSize) {
            queue = queue.slice(queue.length - maxSize);
          }
          queues.set(threadId, queue);
          return queue.length;
        }
      ),
    dequeue: vi.fn().mockImplementation(async (threadId: string) => {
      const queue = queues.get(threadId);
      if (!queue || queue.length === 0) return null;
      const [entry, ...rest] = queue;
      if (rest.length === 0) queues.delete(threadId);
      else queues.set(threadId, rest);
      return entry ?? null;
    }),
    queueDepth: vi.fn().mockImplementation(async (threadId: string) => {
      return queues.get(threadId)?.length ?? 0;
    }),
  };
}

// ─── Test Message Factory ─────────────────────────────────────────────────────

const DEFAULT_THREAD_ID = "discord:GUILD123:CHANNEL456";

/**
 * 创建用于测试的 Message 实例。
 *
 * @param id      消息 ID
 * @param text    消息文本
 * @param overrides  覆盖 MessageData 的任意字段（如 isMention, threadId）
 */
export function createTestMessage(
  id: string,
  text: string,
  overrides?: Partial<MessageData>
): Message {
  return new Message({
    id,
    threadId: DEFAULT_THREAD_ID,
    text,
    formatted: parseMarkdown(text),
    raw: {},
    author: {
      userId: "U123",
      userName: "testuser",
      fullName: "Test User",
      isBot: false,
      isMe: false,
    },
    metadata: {
      dateSent: new Date("2024-01-15T10:30:00.000Z"),
      edited: false,
    },
    attachments: [],
    links: [],
    ...overrides,
  });
}
