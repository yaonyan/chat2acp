/**
 * chat2acp watchdog — keeps the bot alive through crashes and hot reloads.
 *
 * Architecture:
 *   watchdog (this file)  ──spawns──>  bot (src/index.ts)
 *       │                                    │
 *       ├─ watches src/ for changes         ├─ prints CHAT2ACP_READY when up
 *       ├─ on change: spawn new child       ├─ handles SIGTERM for clean exit
 *       │  ├─ new ready → kill old          └─ never exits on its own
 *       │  └─ new timeout → kill new, keep old
 *       └─ on unexpected exit: restart after 2s
 */

import { spawn, type ChildProcess } from "node:child_process";
import { watch, mkdirSync, createWriteStream, writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PID_FILE = resolve(process.cwd(), ".chat2acp.pid");
const READY_MARKER = "CHAT2ACP_READY";
const READY_TIMEOUT_MS = 15_000;
const RESTART_DELAY_MS = 2_000;
const WATCH_DEBOUNCE_MS = 800;

// ── PID file singleton ─────────────────────────────────────────────────────

const myPid = process.pid;
if (existsSync(PID_FILE)) {
  const oldPid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
  if (oldPid && oldPid !== myPid) {
    try { process.kill(oldPid, "SIGKILL"); } catch { /* already dead */ }
    console.log(`[watchdog] Killed previous instance (pid ${oldPid})`);
  }
}
writeFileSync(PID_FILE, String(myPid));

process.on("exit", () => {
  try { unlinkSync(PID_FILE); } catch {}
});

// ── Log file ──────────────────────────────────────────────────

const LOG_DIR = resolve(process.cwd(), "logs");
mkdirSync(LOG_DIR, { recursive: true });
const logFile = createWriteStream(resolve(LOG_DIR, "bot.log"), { flags: "w" });

function writeLog(msg: string) { logFile.write(msg + "\n"); }

const _log = console.log;
const _warn = console.warn;
const _error = console.error;
console.log = (...args) => { _log(...args); writeLog(args.map(String).join(" ")); };
console.warn = (...args) => { _warn(...args); writeLog("WARN " + args.map(String).join(" ")); };
console.error = (...args) => { _error(...args); writeLog("ERR " + args.map(String).join(" ")); };

// ── Spawn child ─────────────────────────────────────────────────────────────

function spawnBot(): ChildProcess {
  // Resolve tsx executable directly to avoid .cmd wrapper issues on Windows
  const tsxBin = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
  const child = spawn(process.execPath, [tsxBin, "src/index.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  child.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(data);
    logFile.write(data);
  });

  child.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(data);
    logFile.write(data);
  });

  return child;
}

// ── Ready detection ─────────────────────────────────────────────────────────

function waitForReady(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);

    const onData = (data: Buffer) => {
      if (data.toString().includes(READY_MARKER)) {
        clearTimeout(timer);
        child.stdout?.removeListener("data", onData);
        child.stderr?.removeListener("data", onData);
        resolve(true);
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData); // some libs log to stderr

    child.on("exit", () => {
      clearTimeout(timer);
      child.stdout?.removeListener("data", onData);
      child.stderr?.removeListener("data", onData);
      resolve(false);
    });
  });
}

// ── File watcher ────────────────────────────────────────────────────────────

function watchSrc(cb: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watcher = watch(resolve(process.cwd(), "src"), { recursive: true }, () => {
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        cb();
      }, WATCH_DEBOUNCE_MS);
    }
  });
  return watcher;
}

// ── Main loop ───────────────────────────────────────────────────────────────

let active: ChildProcess | null = null;
let reloading = false;

function onChildExit(child: ChildProcess) {
  child.on("exit", (code, signal) => {
    if (reloading) return;
    if (code === 0 || signal === "SIGTERM") return;
    console.warn(`[watchdog] Bot exited unexpectedly (code=${code}, signal=${signal}), restarting...`);
    setTimeout(async () => {
      const ok = await startBot();
      if (ok) console.log("[watchdog] Auto-restart successful");
    }, RESTART_DELAY_MS);
  });
}

async function startBot(): Promise<boolean> {
  const child = spawnBot();
  onChildExit(child);
  const ready = await waitForReady(child, READY_TIMEOUT_MS);

  if (active) {
    const old = active;
    old.removeAllListeners("exit");
    old.kill("SIGTERM");
    setTimeout(() => {
      if (old.exitCode === null) old.kill("SIGKILL");
    }, 3000);
  }

  active = child;
  return ready;
}

async function reload() {
  if (reloading) return;
  reloading = true;

  console.log("\n[watchdog] File change detected, attempting hot reload...");

  const old = active;
  const ready = await startBot();

  if (ready) {
    console.log("[watchdog] Hot reload successful ✓");
  } else if (old && old.exitCode === null) {
    console.warn("[watchdog] New bot failed to start, keeping previous instance ✗");
    if (active && active !== old) {
      active.removeAllListeners("exit");
      active.kill("SIGKILL");
      active = old;
    }
  } else {
    console.warn("[watchdog] Bot failed to start, will retry...");
    setTimeout(async () => {
      const ok = await startBot();
      if (ok) console.log("[watchdog] Recovery restart successful");
    }, RESTART_DELAY_MS);
  }

  reloading = false;
}

// ── Start ───────────────────────────────────────────────────────────────────

console.log("[watchdog] chat2acp watchdog starting (pid " + myPid + ")");

const ok = await startBot();
if (!ok) {
  console.error("[watchdog] Initial start failed — is opencode installed?");
  console.error("[watchdog] Will auto-retry on file change...");
}

const watcher = watchSrc(() => reload());

function cleanup() {
  watcher.close();
  if (active) {
    active.kill("SIGTERM");
    setTimeout(() => {
      if (active && active.exitCode === null) active.kill("SIGKILL");
    }, 3000);
  }
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
