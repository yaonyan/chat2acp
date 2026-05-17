import type { Adapter } from "chat";

export function wrapTelegramAdapter(adapter: Adapter): Adapter {
  const typingTimers = new Map<string, ReturnType<typeof setInterval>>();
  const TYPING_INTERVAL_MS = 4_000;
  const MAX_TYPING_DURATION_MS = 30_000;

  function stopTyping(threadId: string) {
    const timer = typingTimers.get(threadId);
    if (timer) {
      clearInterval(timer);
      typingTimers.delete(threadId);
    }
  }

  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === "startTyping") {
        return async (threadId: string, status?: string) => {
          stopTyping(threadId);

          const timer = setInterval(() => {
            target.startTyping(threadId, status).catch(() => {});
          }, TYPING_INTERVAL_MS);
          typingTimers.set(threadId, timer);

          setTimeout(() => stopTyping(threadId), MAX_TYPING_DURATION_MS);

          return target.startTyping(threadId, status);
        };
      }

      if (prop === "postMessage" || prop === "editMessage") {
        return (...args: unknown[]) => {
          stopTyping(String(args[0]));
          return (target as any)[prop](...args);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}