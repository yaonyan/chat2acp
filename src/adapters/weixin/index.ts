import type { Adapter } from "chat";

/**
 * Weixin adapter wrapper.
 *
 * WeixinAdapter does not support editMessage (WeChat DM protocol has no edit API).
 * The chat SDK calls editMessage for streaming updates, so we fall back to
 * postMessage for edits — each streaming chunk becomes a new message.
 */
export function wrapWeixinAdapter(adapter: Adapter): Adapter {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === "editMessage") {
        return (threadId: string, _messageId: string, message: unknown) => {
          return (target as any).postMessage(threadId, message);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
