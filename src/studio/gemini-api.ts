import "server-only";
import { AgentError } from "./errors";

/**
 * Gemini API(REST) 호출 — 웹 데모용.
 * - 키: GEMINI_API_KEY (Google AI Studio에서 발급, 서버 환경변수로만 보관)
 * - 모델: GEMINI_MODEL (기본 gemini-3.5-flash)
 *   2026-11-16 측정: gemini-flash-latest(=3.8-flash)는 150초 넘게 무응답, 3.5-flash는 약 17초, 2.5-flash는 신규 사용 불가
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured() {
  return (process.env.GEMINI_API_KEY ?? "").length > 10;
}

export function geminiModel() {
  const m = process.env.GEMINI_MODEL?.trim();
  return m && /^[a-z0-9.-]+$/.test(m) ? m : "gemini-3.5-flash";
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string };
};

export async function runGemini(
  prompt: string,
  images: { data: string; mimeType: string }[],
  { timeoutMs = 120_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; imagesSent: boolean }> {
  const parts: Part[] = [{ text: prompt }];
  images.forEach((img, i) => {
    parts.push({ text: `[사진${i + 1}]` });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });

  const ctrl = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        // 출력 상한: 본문 900~1600자 + JSON 여유 (사고 토큰 포함 모델 대비 넉넉히, 비용 상한 역할)
        generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: 8192 },
      }),
      signal: ctrl,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new AgentError("TIMEOUT", "Gemini 응답 시간 초과", `model=${geminiModel()} timeout=${timeoutMs}ms`);
    throw new AgentError("AGENT_ERROR", "Gemini에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", String(e));
  }

  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 429) {
      throw new AgentError("RATE_LIMITED", "Gemini 사용량 한도에 걸렸습니다. 1분쯤 뒤에 다시 시도해 주세요.", msg);
    }
    if (res.status === 400 && /api key/i.test(msg)) {
      throw new AgentError("AUTH_REQUIRED", "Gemini API 키가 올바르지 않습니다. 관리자에게 키 설정을 확인해 달라고 해 주세요.", msg);
    }
    if (res.status === 403) {
      throw new AgentError("AUTH_REQUIRED", "Gemini API 키에 권한이 없습니다. 키 설정을 확인해 주세요.", msg);
    }
    throw new AgentError("AGENT_ERROR", "Gemini에서 오류가 났습니다. 다시 시도해 주세요.", `HTTP ${res.status}: ${msg}`);
  }

  if (json.promptFeedback?.blockReason) {
    throw new AgentError("INCOMPLETE", "Gemini가 요청을 거절했습니다. 입력 내용이나 사진을 확인해 주세요.");
  }
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (cand?.finishReason && cand.finishReason !== "STOP") {
    const why: Record<string, string> = {
      MAX_TOKENS: "응답이 너무 길어 중간에 끊겼습니다.",
      SAFETY: "Gemini 안전 필터에 걸렸습니다. 입력 내용이나 사진을 확인해 주세요.",
    };
    throw new AgentError("INCOMPLETE", why[cand.finishReason] ?? "생성이 비정상적으로 끝났습니다. 다시 시도해 주세요.", cand.finishReason);
  }
  if (!text.trim()) throw new AgentError("INCOMPLETE", "Gemini가 빈 응답을 보냈습니다. 다시 시도해 주세요.");
  return { text, imagesSent: images.length > 0 };
}
