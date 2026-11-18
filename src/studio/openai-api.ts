import "server-only";
import { AgentError } from "./errors";

/**
 * GPT(내 API 키) — OpenAI Responses API(글) / Image API(그림).
 * 키는 요청마다 화면에서 받아 OpenAI로 전달만 한다. 저장·로그 금지 (오류 진단 문자열도 redactSecrets 를 거친다).
 */

const RESPONSES = "https://api.openai.com/v1/responses";
const IMAGES = "https://api.openai.com/v1/images/generations";

type OpenAIError = { error?: { message?: string; code?: string; type?: string } };
type ResponsesBody = OpenAIError & {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
};
type ImagesBody = OpenAIError & { data?: { b64_json?: string }[] };

function httpError(status: number, json: OpenAIError, what: string): AgentError {
  const msg = json.error?.message ?? `HTTP ${status}`;
  const code = json.error?.code ?? json.error?.type ?? "";
  if (status === 401) return new AgentError("AUTH_REQUIRED", "OpenAI API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.", msg);
  if (code === "insufficient_quota" || /quota|billing/i.test(msg)) {
    return new AgentError("AUTH_REQUIRED", "OpenAI 계정 잔액(크레딧)이 부족합니다. platform.openai.com 에서 결제 정보를 확인해 주세요.", msg);
  }
  if (status === 429) return new AgentError("RATE_LIMITED", "OpenAI 사용량 한도에 걸렸습니다. 1분쯤 뒤에 다시 시도해 주세요.", msg);
  if (status === 403 || status === 404 || code === "model_not_found") {
    return new AgentError("AUTH_REQUIRED", `이 API 키로는 선택한 ${what}을 쓸 수 없습니다. 다른 모델을 고르거나 OpenAI 계정 권한을 확인해 주세요.`, msg);
  }
  if (status === 400 && /safety|moderation|content policy/i.test(msg)) {
    return new AgentError("INCOMPLETE", "OpenAI 안전 기준에 걸려 만들지 못했습니다. 내용을 바꿔 다시 시도해 주세요.", msg);
  }
  return new AgentError("AGENT_ERROR", "OpenAI에서 오류가 났습니다. 다시 시도해 주세요.", `HTTP ${status}: ${msg}`);
}

async function post<T extends OpenAIError>(url: string, apiKey: string, body: unknown, signal: AbortSignal, timeoutMs: number, label: string) {
  const ctrl = AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl,
    });
    return { res, json: (await res.json().catch(() => ({}))) as T };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new AgentError("TIMEOUT", `OpenAI ${label} 응답 시간 초과`, `timeout=${timeoutMs}ms`);
    throw new AgentError("AGENT_ERROR", "OpenAI에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", String(e));
  }
}

/** 글 생성 (사진은 data URL로 함께 보냄 — 최신 GPT 모델은 모두 이미지 입력 지원) */
export async function runOpenAI(
  prompt: string,
  images: { data: string; mimeType: string }[],
  { apiKey, model, signal, timeoutMs = 180_000 }: { apiKey: string; model: string; signal: AbortSignal; timeoutMs?: number },
): Promise<{ text: string; imagesSent: boolean }> {
  const content: unknown[] = [{ type: "input_text", text: prompt }];
  images.forEach((img, i) => {
    content.push({ type: "input_text", text: `[사진${i + 1}]` });
    content.push({ type: "input_image", image_url: `data:${img.mimeType};base64,${img.data}` });
  });

  const { res, json } = await post<ResponsesBody>(
    RESPONSES,
    apiKey,
    {
      model,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
      // 추론 토큰 포함 상한 — 본문 + JSON 여유, 비용 상한 역할
      max_output_tokens: 12_000,
      // 블로그 글은 깊은 추론이 필요 없음 → 비용·시간 절약 (GPT-6 계열 기본값은 medium)
      reasoning: { effort: "low" },
      store: false,
    },
    signal,
    timeoutMs,
    "글",
  );
  if (!res.ok) throw httpError(res.status, json, "모델");

  const text = (json.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
  if (json.status === "incomplete") {
    const reason = json.incomplete_details?.reason;
    throw new AgentError(
      "INCOMPLETE",
      reason === "content_filter" ? "OpenAI 안전 기준에 걸렸습니다. 입력 내용이나 사진을 확인해 주세요." : "응답이 너무 길어 중간에 끊겼습니다. 다시 시도해 주세요.",
      `incomplete: ${reason}`,
    );
  }
  if (!text.trim()) throw new AgentError("INCOMPLETE", "OpenAI가 빈 응답을 보냈습니다. 다시 시도해 주세요.");
  return { text, imagesSent: images.length > 0 };
}

/**
 * 블로그 본문 중간에 넣을 설명용 그림.
 * 실제 수업 사진처럼 보이면 학부모를 오해하게 만들 수 있으므로, 사진풍·실존 인물·글자를 막고 일러스트로만 그린다.
 */
const IMAGE_STYLE = [
  "Warm, friendly flat vector illustration for a Korean children's English academy blog post.",
  "Soft sky blue (#008CD7) and warm yellow accents, clean light background, simple rounded shapes, gentle mood.",
  "Absolutely no text, letters, numbers, logos or watermarks anywhere in the image.",
  "Not photorealistic. If children or teachers appear, draw them as simple cartoon characters, never realistic people.",
  "Scene to illustrate:",
].join(" ");

/** 서버 환경변수에 등록된 OpenAI 키 (화면에 키를 넣지 않아도 GPT 사용) */
export function openaiServerKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

const IMAGE_MODELS = [process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare", "gpt-image-2"];

export async function generateImage(
  description: string,
  { apiKey, signal }: { apiKey: string; signal: AbortSignal },
): Promise<string> {
  let last: AgentError | undefined;
  for (const model of [...new Set(IMAGE_MODELS)]) {
    const { res, json } = await post<ImagesBody>(
      IMAGES,
      apiKey,
      {
        model,
        prompt: `${IMAGE_STYLE} ${description}`,
        size: "1536x1024",
        quality: "medium",
        output_format: "jpeg",
        output_compression: 82,
        n: 1,
      },
      signal,
      150_000,
      "그림",
    );
    if (res.ok) {
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new AgentError("INCOMPLETE", "OpenAI가 그림을 보내지 않았습니다. 다시 시도해 주세요.");
      return `data:image/jpeg;base64,${b64}`;
    }
    last = httpError(res.status, json, "그림 모델");
    // 모델 권한·이름 문제일 때만 다음 모델로 재시도
    if (!(res.status === 403 || res.status === 404 || json.error?.code === "model_not_found")) break;
  }
  throw last!;
}
