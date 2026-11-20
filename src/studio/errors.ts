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
const SECRET_ENV = ["STUDIO_PASSWORD", "STUDIO_SECRET", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "VERCEL_OIDC_TOKEN"];
// 마지막 패턴: OpenAI 오류 문구가 키 앞뒤 몇 글자를 보여 주는 형태 (sk-proj-***…abcd) — 일부라도 로그에 남기지 않음
const KEY_PATTERNS = [/AIza[0-9A-Za-z_-]{30,}/g, /\bsk-[A-Za-z0-9_-]{16,}/g, /\bsk-[A-Za-z0-9_-]*\*+[A-Za-z0-9_-]*/g];

/** 비밀값 조각 길이: 이 길이 이상 연속으로 같으면 일부라도 가린다 (짧은 우연 일치는 무시) */
const PARTIAL = 10;

export function redactSecrets(text: string) {
  let out = text;
  for (const name of SECRET_ENV) {
    const v = process.env[name];
    if (!v || v.length < 6) continue;
    out = out.split(v).join("[가림]");
    // 비밀값의 연속 조각(앞부분만 쓰고 끝난 경우, 길이 제한에 잘린 경우 등)도 가림
    const w = Math.min(PARTIAL, v.length);
    for (let i = 0; i + w <= v.length; i++) {
      const piece = v.slice(i, i + w);
      if (out.includes(piece)) out = out.split(piece).join("[가림]");
    }
  }
  for (const re of KEY_PATTERNS) out = out.replace(re, "[가림]");
  return out;
}

/**
 * 스트리밍 때 끝에서 보류할 글자 수: 가장 긴 비밀값보다 길게 잡는다.
 * (비밀값 앞부분만 먼저 화면에 나가는 일이 없도록 — 값 전체가 들어와야 가릴 수 있음)
 */
export function secretHold() {
  let max = 220; // API 키 형식(sk-…, AIza…)의 넉넉한 최대 길이
  for (const name of SECRET_ENV) max = Math.max(max, process.env[name]?.length ?? 0);
  return max + 16;
}
