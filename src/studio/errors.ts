export type AgentErrorCode =
  | "SPAWN_FAILED"
  | "AUTH_REQUIRED"
  | "TIMEOUT"
  | "AGENT_ERROR"
  | "INCOMPLETE"
  | "BUSY"
  | "RATE_LIMITED";

export class AgentError extends Error {
  constructor(
    public code: AgentErrorCode,
    message: string,
  ) {
    super(message);
  }
}
