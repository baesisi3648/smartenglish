import "server-only";
import { GPT_TRIAL_UNTIL } from "./agents";
import { AgentError } from "./errors";
import { parseJson, sseData, type OnDelta } from "./sse";

/**
 * GPT(내 API 키) / GPT 체험(서버 키, 하루 10회) — OpenAI Responses API(글) / Image API(그림).
 * 키는 요청마다 화면에서 받아 OpenAI로 전달만 한다. 저장·로그 금지 (오류 진단 문자열도 redactSecrets 를 거친다).
 */

/** GPT 체험용 서버 키 (OPENAI_API_KEY). 형식이 맞을 때만 체험 메뉴를 켠다 */
export function openaiTrialKey() {
  const k = process.env.OPENAI_API_KEY?.trim() ?? "";
  return /^sk-[A-Za-z0-9_-]{20,200}$/.test(k) ? k : "";
}
/** 체험 기간(한국 날짜 기준 GPT_TRIAL_UNTIL 까지) 안이고 서버 키가 있을 때만 켠다 */
export function openaiTrialConfigured(now = Date.now()) {
  const kstDay = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return kstDay <= GPT_TRIAL_UNTIL && !!openaiTrialKey();
}

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

function netError(e: unknown, label: string, timeoutMs: number) {
  if (e instanceof AgentError) return e;
  if (e instanceof Error && e.name === "TimeoutError") return new AgentError("TIMEOUT", `OpenAI ${label} 응답 시간 초과`, `timeout=${timeoutMs}ms`);
  if (e instanceof Error && e.name === "AbortError") return new AgentError("AGENT_ERROR", "요청이 취소되었습니다.");
  return new AgentError("AGENT_ERROR", "OpenAI에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", String(e));
}

async function send(url: string, apiKey: string, body: unknown, signal: AbortSignal) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
}

async function post<T extends OpenAIError>(url: string, apiKey: string, body: unknown, signal: AbortSignal, timeoutMs: number, label: string) {
  const ctrl = AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]);
  try {
    const res = await send(url, apiKey, body, ctrl);
    return { res, json: (await res.json().catch(() => ({}))) as T };
  } catch (e) {
    throw netError(e, label, timeoutMs);
  }
}

function incompleteError(reason: string | undefined) {
  return new AgentError(
    "INCOMPLETE",
    reason === "content_filter" ? "OpenAI 안전 기준에 걸렸습니다. 입력 내용이나 사진을 확인해 주세요." : "응답이 너무 길어 중간에 끊겼습니다. 다시 시도해 주세요.",
    `incomplete: ${reason}`,
  );
}

type StreamEvent = {
  type?: string;
  delta?: string;
  message?: string;
  code?: string;
  response?: ResponsesBody & { error?: { message?: string; code?: string } };
};

/** 스트리밍: 글 조각이 올 때마다 onDelta 로 넘기고, 끝나면 전체 글을 돌려준다 */
async function streamResponses(apiKey: string, body: Record<string, unknown>, signal: AbortSignal, timeoutMs: number, onDelta: OnDelta) {
  const ctrl = AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]);
  let text = "";
  let completed = false;
  try {
    const res = await send(RESPONSES, apiKey, { ...body, stream: true }, ctrl);
    if (!res.ok || !res.body) throw httpError(res.status, (await res.json().catch(() => ({}))) as OpenAIError, "모델");
    for await (const data of sseData(res.body)) {
      const ev = parseJson<StreamEvent>(data);
      if (!ev) continue;
      if (ev.type === "response.output_text.delta" && ev.delta) {
        text += ev.delta;
        onDelta(ev.delta);
      } else if (ev.type === "response.completed") {
        completed = true;
        break; // 정상 완료 확정 → 더 읽지 않음
      } else if (ev.type === "response.incomplete") {
        throw incompleteError(ev.response?.incomplete_details?.reason);
      } else if (ev.type === "response.failed" || ev.type === "error") {
        const err = ev.response?.error ?? { message: ev.message, code: ev.code };
        throw httpError(500, { error: err }, "모델");
      }
    }
    // 완료 신호 없이 연결이 닫히면 글이 잘렸을 수 있음
    if (!completed) throw new AgentError("INCOMPLETE", "응답이 중간에 끊겼습니다. 다시 시도해 주세요.", "stream ended without response.completed");
    return text;
  } catch (e) {
    throw netError(e, "글", timeoutMs);
  }
}

/** 글 생성 (사진은 data URL로 함께 보냄 — 최신 GPT 모델은 모두 이미지 입력 지원) */
export async function runOpenAI(
  prompt: string,
  images: { data: string; mimeType: string }[],
  {
    apiKey,
    model,
    signal,
    timeoutMs = 180_000,
    onDelta,
  }: { apiKey: string; model: string; signal: AbortSignal; timeoutMs?: number; onDelta?: OnDelta },
): Promise<{ text: string; imagesSent: boolean }> {
  const content: unknown[] = [{ type: "input_text", text: prompt }];
  images.forEach((img, i) => {
    content.push({ type: "input_text", text: `[사진${i + 1}]` });
    content.push({ type: "input_image", image_url: `data:${img.mimeType};base64,${img.data}` });
  });

  const request = {
    model,
    input: [{ role: "user", content }],
    text: { format: { type: "json_object" } },
    // 추론 토큰 포함 상한 — 본문 + JSON 여유, 비용 상한 역할
    max_output_tokens: 12_000,
    // 블로그 글은 깊은 추론이 필요 없음 → 비용·시간 절약 (GPT-6 계열 기본값은 medium)
    reasoning: { effort: "low" },
    store: false,
  };
  if (onDelta) {
    const text = await streamResponses(apiKey, request, signal, timeoutMs, onDelta);
    if (!text.trim()) throw new AgentError("INCOMPLETE", "OpenAI가 빈 응답을 보냈습니다. 다시 시도해 주세요.");
    return { text, imagesSent: images.length > 0 };
  }

  const { res, json } = await post<ResponsesBody>(RESPONSES, apiKey, request, signal, timeoutMs, "글");
  if (!res.ok) throw httpError(res.status, json, "모델");

  const text = (json.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
  if (json.status === "incomplete") throw incompleteError(json.incomplete_details?.reason);
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
