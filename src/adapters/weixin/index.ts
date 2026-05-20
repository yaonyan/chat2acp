import type { Adapter } from "chat";

/**
 * WeixinAdapter does not support editMessage or native streaming.
 * The chat SDK's fallbackStream (post + edit) doesn't work.
 * By implementing .stream, each chunk from the iterator becomes a new message.
 */
export function wrapWeixinAdapter(adapter: Adapter): Adapter {
  const origPost = adapter.postMessage.bind(adapter);

  const wrapped: Adapter = new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === "stream") {
        return async (threadId: string, stream: AsyncIterable<string>) => {
          let lastMsg: { id: string; threadId: string } | null = null;
          for await (const chunk of stream) {
            if (typeof chunk === "string" && chunk.trim()) {
              lastMsg = await origPost(threadId, chunk);
            }
          }
          return lastMsg ?? { id: "", threadId };
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return wrapped;
}
