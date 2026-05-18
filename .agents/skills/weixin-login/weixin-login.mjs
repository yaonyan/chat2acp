#!/usr/bin/env node
/**
 * WeChat Bot QR-code login helper.
 *
 * Usage:
 *   node weixin-login.mjs
 *
 * Prints a JSON result to stdout on success:
 *   { "ok": true, "botToken": "...", "baseUrl": "...", "userId": "..." }
 */
import { startLogin, waitForLogin } from "@yaonyan/chat-adapter-weixin";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise((r) => rl.question(q, r));

// Step 1: fetch QR code
const start = await startLogin();
if (!start.ok) {
  console.error("Failed to start login:", start.reason);
  process.exit(1);
}

console.error("Scan this URL with WeChat (expires in ~2 minutes):");
console.error(start.qrcodeUrl);

await question("\nPress Enter after scanning and confirming in WeChat...");
rl.close();

// Step 2: poll for result
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await waitForLogin(start.sessionId);
  if (r.ok) {
    console.log(JSON.stringify({ ok: true, botToken: r.botToken, baseUrl: r.baseUrl, userId: r.userId ?? "" }));
    process.exit(0);
  }
  if (r.reason && !r.reason.includes("wait") && !r.reason.includes("scan")) {
    console.error("Login error:", r.reason);
    process.exit(1);
  }
}

console.error("Timeout waiting for login confirmation.");
process.exit(1);
