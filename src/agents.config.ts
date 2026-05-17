/**
 * ACP Agent Configuration
 *
 * Hardcoded list of known ACP-compatible agents.
 * To add a new agent, create a PR adding it here.
 * IDs match the ACP Registry convention: https://agentclientprotocol.com/get-started/registry
 *
 * Set `ACP_AGENT` in `.env` to the agent ID (or name) to switch:
 *   ACP_AGENT=claude    # Claude Code
 *   ACP_AGENT=gemini    # Gemini CLI
 *   ACP_AGENT=opencode  # OpenCode (default)
 */

export interface ACPAgentConfig {
  /** Registry-style ID used for matching (e.g. "opencode", "gemini") */
  id: string;
  /** Display name */
  name: string;
  /** Command to spawn */
  command: string;
  /** Arguments passed to the command */
  args: string[];
  /** Authentication method ID used by lazy auth */
  authMethodId?: string;
  /** Keep the agent process alive between calls */
  persistSession?: boolean;
  /** Delay in ms before initializing the connection */
  sessionDelayMs?: number;
  /** npm package name (if installable via npx) */
  npmPackage?: string;
  /** Required env vars */
  env?: { key: string; required?: boolean; default?: string }[];
  /** Installation hint for users */
  installHint?: string;
}

export const AGENTS: ACPAgentConfig[] = [
  {
    id: "claude",
    name: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
    persistSession: true,
    npmPackage: "@zed-industries/claude-code-acp",
    env: [{ key: "ANTHROPIC_API_KEY", required: false }],
    installHint: "npm install -g @zed-industries/claude-code-acp",
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    persistSession: true,
    npmPackage: "@zed-industries/codex-acp",
    env: [{ key: "OPENAI_API_KEY", required: false }],
    installHint: "npm install -g @zed-industries/codex-acp",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    command: "npx",
    args: ["-y", "@github/copilot", "--acp"],
    persistSession: true,
    npmPackage: "@github/copilot",
    installHint: "npm install -g @github/copilot",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "npx",
    args: ["-y", "@google/gemini-cli", "--acp"],
    authMethodId: "gemini-api-key",
    persistSession: true,
    npmPackage: "@google/gemini-cli",
    env: [{ key: "GEMINI_API_KEY", required: false }],
    installHint: "npm install -g @google/gemini-cli",
  },
  {
    id: "kimi",
    name: "Kimi CLI",
    command: "kimi",
    args: ["--acp"],
    persistSession: true,
    installHint: "npm install -g kimi-cli",
  },
  {
    id: "goose",
    name: "Goose",
    command: "goose",
    args: ["acp"],
    persistSession: true,
    installHint: "pipx install goose-ai",
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    args: ["acp"],
    persistSession: true,
    installHint: "npm install -g opencode-ai",
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    command: "cursor",
    args: ["agent", "acp"],
    persistSession: true,
    installHint: "cursor comes with Cursor editor",
  },
  {
    id: "droid",
    name: "Factory Droid",
    command: "npx",
    args: ["-y", "droid", "exec", "--output-format", "acp-daemon"],
    persistSession: true,
    npmPackage: "droid",
    env: [{ key: "FACTORY_API_KEY", required: false }],
    installHint: "npm install -g droid",
  },
  {
    id: "codebuddy",
    name: "CodeBuddy Code",
    command: "npx",
    args: ["-y", "@tencent-ai/codebuddy-code", "--acp"],
    persistSession: true,
    npmPackage: "@tencent-ai/codebuddy-code",
    env: [{ key: "CODEBUDDY_API_KEY", required: false }],
    installHint: "npm install -g @tencent-ai/codebuddy-code",
  },
];

// Build lookups
const byId = new Map<string, ACPAgentConfig>();
const byName = new Map<string, ACPAgentConfig>();
for (const a of AGENTS) {
  byId.set(a.id.toLowerCase(), a);
  byName.set(a.name.toLowerCase(), a);
}

/**
 * Resolve an agent by registry-style ID, name, or ACP_AGENT env var.
 * Falls back to "opencode" if nothing matches.
 */
export function resolveAgent(name?: string): ACPAgentConfig {
  const key = (name ?? process.env.ACP_AGENT ?? "opencode").toLowerCase();
  const agent = byId.get(key);
  if (agent) return agent;
  const byNameMatch = byName.get(key);
  if (byNameMatch) return byNameMatch;
  const fuzzy = AGENTS.find((a) => a.name.toLowerCase().includes(key) || a.id.toLowerCase().includes(key));
  if (fuzzy) return fuzzy;
  console.warn(`[agents] Unknown agent "${name ?? process.env.ACP_AGENT}", falling back to OpenCode`);
  return byId.get("opencode")!;
}

export const defaultAgent = resolveAgent();