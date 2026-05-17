import "dotenv/config";
import { createServer } from "node:http";
import { createBot, type ChatAdapterName } from "./bot.js";
import { syncPlatformCommands } from "./commands.js";

const adapter = (process.env.CHAT_ADAPTER ?? "weixin") as ChatAdapterName;

const adminUserIds = process.env.ADMIN_USER_IDS
  ? process.env.ADMIN_USER_IDS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const { bot, provider, startListening } = createBot({ adapter, adminUserIds });

await bot.initialize();
console.log(`chat2acp bot is running... [adapter: ${adapter}]`);
if (adminUserIds.length > 0) {
  console.log(`Admin user IDs: ${adminUserIds.join(", ")}`);
}

await syncPlatformCommands({ adapterName: adapter });

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

// ── HTTP server for Discord/Slack interactions ──────────────────────────
//
// Discord and Slack deliver slash command / button / modal interactions
// exclusively via HTTP POST to the configured Interactions Endpoint.
// They do NOT arrive through the Gateway WebSocket. Without a reachable
// HTTP endpoint, interaction-based events (onSlashCommand, onAction, etc.)
// will always fail with "The application did not respond".
//
// This server bridges Node's http.IncomingMessage to the web standard
// Request that Chat SDK expects. In production, you would replace this
// with your framework's webhook handler (e.g., Next.js route).
//
// Telegram and WeChat handle interactions through their own adapters
// (polling / webhook auto-detection) — no separate HTTP server needed.

const DISCO_PORT = parseInt(process.env.HTTP_PORT ?? "3080", 10);
let server: ReturnType<typeof createServer> | null = null;

if (adapter === "discord" || adapter === "slack") {
  server = createServer(async (req, res) => {
    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);

    // Build a Request from the incoming http.IncomingMessage
    const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    const webRequest = new Request(url, {
      method: req.method ?? "GET",
      headers,
      body: body.length > 0 ? body : undefined,
    });

    try {
      const webhook = (bot.webhooks as Record<string, (r: Request) => Promise<Response>>)[adapter];
      if (!webhook) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const response = await webhook(webRequest);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
    } catch (err) {
      console.error("[http] Webhook error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  server.listen(DISCO_PORT, () => {
    console.log(`[http] Listening on port ${DISCO_PORT} for interaction events`);
  });
}

await startListening(abortController.signal);
console.log("CHAT2ACP_READY");
