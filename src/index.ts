import "dotenv/config";
import { createBot } from "./bot.js";

const { bot, provider, discordAdapter } = createBot();

await bot.initialize();
console.log("chat2acp bot is running...");

// Start Discord Gateway WebSocket listener to receive messages in real-time.
// Without this, the bot only handles webhook interactions but cannot receive
// regular messages or @mentions from Discord.
const abortController = new AbortController();
await discordAdapter.startGatewayListener(
  { waitUntil: (p: Promise<unknown>) => p.catch(() => {}) },
  // Keep listening indefinitely (24 hours, re-connects on restart)
  24 * 60 * 60 * 1000,
  abortController.signal,
);

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  abortController.abort();
  provider.cleanup();
  await bot.shutdown();
  process.exit(0);
});
