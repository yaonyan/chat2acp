/**
 * ACP Agent Configuration
 *
 * Defines available ACP-compatible agents and their spawn settings.
 * The ACP provider spawns the agent as a child process and communicates
 * via JSON-RPC 2.0 over stdin/stdout.
 *
 * @see ACP Registry: https://agentclientprotocol.com/get-started/registry
 * @see Registry JSON: https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json
 * @see ACP Specification: https://agentclientprotocol.com/specification
 * @see @mcpc-tech/acp-ai-provider: https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider
 */

export interface ACPAgentConfig {
  /** Command to spawn the ACP agent (e.g., "opencode", "claude") */
  command: string;
  /** Arguments passed to the command (e.g., ["acp"] for opencode's ACP subcommand) */
  args: string[];
  /**
   * Authentication method ID used by lazy auth.
   * Omit or set to undefined to auto-detect from the agent's initialize response.
   */
  authMethodId?: string;
  /** Whether to keep the agent process alive between calls (avoids MCP cold-boot) */
  persistSession?: boolean;
  /** Delay in ms before initializing the connection (useful for agents that load MCP servers async) */
  sessionDelayMs?: number;
}

/**
 * Default ACP agent: OpenCode.
 *
 * OpenCode is an open-source AI coding agent that speaks ACP natively.
 * Run `opencode acp --help` to see all ACP mode options.
 *
 * @see https://opencode.ai
 */
export const defaultAgent: ACPAgentConfig = {
  command: "opencode",
  args: ["acp"],
  // authMethodId omitted — let opencode auto-detect available auth methods
  persistSession: true,
};
