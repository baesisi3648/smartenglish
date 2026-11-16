export type AgentErrorCode =
  | "SPAWN_FAILED"
  | "AUTH_REQUIRED"
  | "TIMEOUT"
  | "AGENT_ERROR"
  | "INCOMPLETE"
  | "BUSY"
  | "RATE_LIMITED";

/**
 * message: 화면에 보여 줄 고정 문구 (내부 경로·원문 오류를 넣지 않는다)
 * detail: 서버 로그에만 남길 진단 정보 (기록 전에 redactSecrets 처리)
 */
export class AgentError extends Error {
  constructor(
    public code: AgentErrorCode,
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

/** 서버 비밀값(비밀번호·서명키·API 키)이 문자열에 섞여 있으면 가린다 — 모델 출력·로그 공통 */
const SECRET_ENV = ["STUDIO_PASSWORD", "STUDIO_SECRET", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "VERCEL_OIDC_TOKEN"];
const KEY_PATTERNS = [/AIza[0-9A-Za-z_-]{30,}/g, /\bsk-[A-Za-z0-9_-]{16,}/g];

export function redactSecrets(text: string) {
  let out = text;
  for (const name of SECRET_ENV) {
    const v = process.env[name];
    if (v && v.length >= 6) out = out.split(v).join("[가림]");
  }
  for (const re of KEY_PATTERNS) out = out.replace(re, "[가림]");
  return out;
}
