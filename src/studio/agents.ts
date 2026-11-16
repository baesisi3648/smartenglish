/**
 * 스튜디오 AI 레지스트리.
 * - kind "acp": 원장 PC에서 "구독 계정으로 로그인된" CLI를 ACP 어댑터로 띄운다 (API 키 불필요, 로컬 전용).
 * - kind "api": 서버의 API 키(GEMINI_API_KEY / DEEPSEEK_API_KEY)로 호출한다 (웹 데모용, 배포 사이트에서도 동작).
 * Gemini CLI(구독 로그인) 방식은 Google이 개인 계정 지원을 중단해 쓰지 않는다 (2026-11 확인).
 */
export type ApiAgentId = "gemini" | "deepseek";
export type AgentId = "chatgpt" | "claude" | ApiAgentId;
export type AcpAgentId = Exclude<AgentId, ApiAgentId>;

type Base = { label: string; plan: string; loginHelp: string };
export type AcpAgentDef = Base & {
  id: AcpAgentId;
  kind: "acp";
  command: string;
  args: string[];
  /** 구독 로그인용 ACP authMethod id (API 키 방식은 쓰지 않음) */
  authMethods: string[];
};
export type ApiAgentDef = Base & { id: ApiAgentId; kind: "api" };
export type AgentDef = AcpAgentDef | ApiAgentDef;

export const ACP_AGENTS: Record<AcpAgentId, AcpAgentDef> = {
  chatgpt: {
    id: "chatgpt",
    kind: "acp",
    label: "ChatGPT",
    plan: "ChatGPT Plus / Pro 구독 (Codex)",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp"],
    loginHelp: "처음 한 번 로그인 필요: 터미널에서 `npx @openai/codex login` → ChatGPT 계정으로 로그인",
    authMethods: ["chatgpt"],
  },
  claude: {
    id: "claude",
    kind: "acp",
    label: "Claude",
    plan: "Claude Pro / Max 구독",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    loginHelp: "처음 한 번 로그인 필요: 터미널에서 `claude` 실행 → /login 으로 구독 계정 로그인",
    authMethods: ["claude-login", "claude-ai"],
  },
};

export const GEMINI_AGENT: ApiAgentDef = {
  id: "gemini",
  kind: "api",
  label: "Gemini (웹)",
  plan: "Google Gemini API · 설치 없이 바로",
  loginHelp: "서버에 등록된 Gemini API 키로 동작합니다. 별도 로그인은 필요 없어요.",
};

export const DEEPSEEK_AGENT: ApiAgentDef = {
  id: "deepseek",
  kind: "api",
  label: "DeepSeek (웹)",
  plan: "DeepSeek API · 설치 없이 바로",
  loginHelp: "서버에 등록된 DeepSeek API 키로 동작합니다. 별도 로그인은 필요 없어요.",
};

export const AGENTS: Record<AgentId, AgentDef> = { ...ACP_AGENTS, gemini: GEMINI_AGENT, deepseek: DEEPSEEK_AGENT };

export function isAgentId(id: string): id is AgentId {
  return Object.hasOwn(AGENTS, id);
}
