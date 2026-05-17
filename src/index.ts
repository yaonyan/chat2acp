import "dotenv/config";
import { createBot, type ChatAdapterName } from "./bot.js";

const adapter = (process.env.CHAT_ADAPTER ?? "weixin") as ChatAdapterName;
const { bot, provider, startListening } = createBot({ adapter });

await bot.initialize();
console.log(`chat2acp bot is running... [adapter: ${adapter}]`);

const abortController = new AbortController();
await startListening(abortController.signal);

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  abortController.abort();
  provider.cleanup();
  await bot.shutdown();
  process.exit(0);
});
