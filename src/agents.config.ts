export interface ACPAgentConfig {
  name: string;
  command: string;
  args: string[];
  authMethodId?: string;
  persistSession?: boolean;
  sessionDelayMs?: number;
  env?: { key: string; required?: boolean; default?: string }[];
  npmPackage?: string;
  installHint?: string;
}

export const AGENTS: ACPAgentConfig[] = [
  {
    name: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
    persistSession: true,
    npmPackage: "@zed-industries/claude-code-acp",
    env: [{ key: "ANTHROPIC_API_KEY", required: false }],
    installHint: "npm install -g @zed-industries/claude-code-acp",
  },
  {
    name: "Codex CLI",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    persistSession: true,
    npmPackage: "@zed-industries/codex-acp",
    env: [{ key: "OPENAI_API_KEY", required: false }],
    installHint: "npm install -g @zed-industries/codex-acp",
  },
  {
    name: "GitHub Copilot",
    command: "copilot",
    args: ["--acp"],
    persistSession: true,
    installHint: "npm install -g @github/copilot",
  },
  {
    name: "Gemini CLI",
    command: "gemini",
    args: ["--experimental-acp"],
    authMethodId: "gemini-api-key",
    persistSession: true,
    env: [{ key: "GEMINI_API_KEY", required: false }],
    installHint: "npm install -g @google-gemini/gemini-cli",
  },
  {
    name: "Kimi CLI",
    command: "kimi",
    args: ["--acp"],
    persistSession: true,
    installHint: "pip install kimi-cli",
  },
  {
    name: "Goose",
    command: "goose",
    args: ["acp"],
    persistSession: true,
    installHint: "pipx install goose-ai",
  },
  {
    name: "OpenCode",
    command: "opencode",
    args: ["acp"],
    persistSession: true,
    installHint: "npm install -g opencode-ai",
  },
  {
    name: "Cursor Agent",
    command: "cursor",
    args: ["agent", "acp"],
    persistSession: true,
    installHint: "Cursor editor bundles the cursor CLI",
  },
  {
    name: "Droid",
    command: "droid",
    args: ["exec", "--output-format", "acp"],
    persistSession: true,
    env: [{ key: "FACTORY_API_KEY", required: false }],
    installHint: "npm install -g @factory-ai/droid",
  },
  {
    name: "CodeBuddy Code",
    command: "npx",
    args: ["-y", "@tencent-ai/codebuddy-code", "--acp"],
    persistSession: true,
    npmPackage: "@tencent-ai/codebuddy-code",
    env: [{ key: "CODEBUDDY_API_KEY", required: false }],
    installHint: "npm install -g @tencent-ai/codebuddy-code",
  },
];

const AGENT_MAP = new Map(AGENTS.map((a) => [a.name.toLowerCase(), a]));

export function resolveAgent(name?: string): ACPAgentConfig {
  const key = (name ?? process.env.ACP_AGENT ?? "opencode").toLowerCase();
  const agent = AGENT_MAP.get(key);
  if (agent) return agent;
  const match = AGENTS.find((a) => a.name.toLowerCase().includes(key));
  if (match) return match;
  console.warn(`[agents] Unknown agent "${name ?? process.env.ACP_AGENT}", falling back to OpenCode`);
  return AGENTS[6]; // OpenCode
}

export const defaultAgent = resolveAgent();