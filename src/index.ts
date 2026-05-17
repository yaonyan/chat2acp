import "dotenv/config";
import { createBot, type ChatAdapterName } from "./bot.js";

const adapter = (process.env.CHAT_ADAPTER ?? "weixin") as ChatAdapterName;
const { bot, provider, startListening } = createBot({ adapter });

await bot.initialize();
console.log(`chat2acp bot is running... [adapter: ${adapter}]`);

const abortController = new AbortController();

// Ensure clean shutdown — abort signal, cleanup provider, shutdown bot, then force exit.
// Without force exit, Telegram long-polling and Discord gateway connections can keep
// the process alive, causing duplicate instances when tsx --watch restarts.
function shutdown() {
  abortController.abort();
  provider.cleanup();
  bot.shutdown().finally(() => {
    process.exit(0);
  });
  // Fallback: force exit after 3s if graceful shutdown hangs
  setTimeout(() => process.exit(0), 3000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await startListening(abortController.signal);
