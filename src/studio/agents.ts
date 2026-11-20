/**
 * 스튜디오 AI 레지스트리.
 * - kind "acp": 원장 PC에서 "구독 계정으로 로그인된" CLI를 ACP 어댑터로 띄운다 (API 키 불필요, 로컬 전용).
 * - kind "api": 서버의 API 키(GEMINI_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY)로 호출한다 (웹 데모용, 배포 사이트에서도 동작).
 *   GPT 체험("gpt")은 서버 OpenAI 키로 하루 10회까지만 (키 없이 GPT를 써 보는 용도).
 * - kind "byok": 원장님이 화면에 넣은 본인 API 키(OpenAI)로 호출한다. 키는 브라우저에만 저장되고 서버는 요청마다 전달만 한다.
 * Gemini CLI(구독 로그인) 방식은 Google이 개인 계정 지원을 중단해 쓰지 않는다 (2026-11 확인).
 */
export type ApiAgentId = "gemini" | "deepseek" | "gpt";
export type ByokAgentId = "openai";
export type AgentId = "chatgpt" | "claude" | ApiAgentId | ByokAgentId;
export type AcpAgentId = Exclude<AgentId, ApiAgentId | ByokAgentId>;

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
export type ByokAgentDef = Base & { id: ByokAgentId; kind: "byok" };
export type AgentDef = AcpAgentDef | ApiAgentDef | ByokAgentDef;

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

export const GPT_TRIAL_AGENT: ApiAgentDef = {
  id: "gpt",
  kind: "api",
  label: "GPT 체험 (하루 10회)",
  plan: "키 입력 없이 GPT로 · 하루 10회까지",
  loginHelp:
    "서버에 등록된 OpenAI 키로 하루 10회(초안·글 추천·고치기 합산)까지 써 볼 수 있어요. AI 그림은 'GPT (내 API 키)'에서만 됩니다.",
};

export const OPENAI_AGENT: ByokAgentDef = {
  id: "openai",
  kind: "byok",
  label: "GPT (내 API 키)",
  plan: "OpenAI API 키 · 쓴 만큼 과금 · AI 그림 가능",
  loginHelp:
    "platform.openai.com → API keys 에서 만든 키(sk-로 시작)를 아래에 넣어 주세요. 키는 이 브라우저에만 저장되고, 서버는 요청을 전달할 때만 쓰고 저장하지 않습니다.",
};

export const AGENTS: Record<AgentId, AgentDef> = {
  ...ACP_AGENTS,
  gemini: GEMINI_AGENT,
  deepseek: DEEPSEEK_AGENT,
  gpt: GPT_TRIAL_AGENT,
  openai: OPENAI_AGENT,
};

export function isAgentId(id: string): id is AgentId {
  return Object.hasOwn(AGENTS, id);
}
