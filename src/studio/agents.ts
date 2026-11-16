/**
 * ACP 에이전트 레지스트리.
 * 각 에이전트는 원장 PC에서 "구독 계정으로 로그인된" CLI를 ACP 어댑터로 띄운다.
 * API 키 불필요 — 처음 한 번 각 CLI에서 로그인만 해 두면 된다.
 */
export type AgentId = "claude" | "chatgpt" | "gemini";

export type AgentDef = {
  id: AgentId;
  label: string;
  plan: string;
  command: string;
  args: string[];
  loginHelp: string;
  /** 구독 로그인용 ACP authMethod id (API 키 방식은 쓰지 않음) */
  authMethods: string[];
};

export const AGENTS: Record<AgentId, AgentDef> = {
  claude: {
    id: "claude",
    label: "Claude",
    plan: "Claude Pro / Max 구독",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    loginHelp: "터미널에서 `claude` 실행 → /login 으로 구독 계정 로그인",
    authMethods: ["claude-login", "claude-ai"],
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    plan: "ChatGPT Plus / Pro 구독 (Codex)",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp"],
    loginHelp: "터미널에서 `npx @openai/codex login` → ChatGPT 계정으로 로그인",
    authMethods: ["chatgpt"],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    plan: "Google 계정 (Gemini 구독/무료)",
    command: "npx",
    args: ["-y", "@google/gemini-cli", "--acp"],
    loginHelp: "터미널에서 `npx @google/gemini-cli` 실행 → 'Login with Google' 선택",
    authMethods: ["oauth-personal"],
  },
};

export const AGENT_LIST = Object.values(AGENTS);
