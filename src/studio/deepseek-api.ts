import "server-only";
import { AgentError } from "./errors";
import { parseJson, sseData, type OnDelta } from "./sse";

/**
 * DeepSeek API(OpenAI 호환 Chat Completions) 호출 — 웹 데모용.
 * - 키: DEEPSEEK_API_KEY (platform.deepseek.com 에서 발급, 서버 환경변수로만 보관)
 * - 모델: DEEPSEEK_MODEL (기본 deepseek-flash)
 * - 사진: DEEPSEEK_IMAGES=0 이면 보내지 않음. 모델이 사진 입력을 거부하면 글만으로 한 번 다시 시도.
 * 참고: DeepSeek은 데이터를 중국 서버에 보관한다 (관리자 판단으로 안내 문구 없이 사용).
 */
const ENDPOINT = "https://api.deepseek.com/chat/completions";

export function deepseekConfigured() {
  return (process.env.DEEPSEEK_API_KEY ?? "").length > 10;
}

export function deepseekSendsImages() {
  return process.env.DEEPSEEK_IMAGES !== "0";
}

function deepseekModel() {
  const m = process.env.DEEPSEEK_MODEL?.trim();
  return m && /^[a-z0-9.-]+$/.test(m) ? m : "deepseek-flash";
}

type Content = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string };
};

type StreamChunk = { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; error?: { message?: string } };

function netError(e: unknown) {
  if (e instanceof AgentError) return e;
  if (e instanceof Error && e.name === "TimeoutError") return new AgentError("TIMEOUT", "DeepSeek 응답 시간 초과");
  return new AgentError("AGENT_ERROR", "DeepSeek에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", String(e));
}

/** 스트리밍 조각을 이어 붙여 일반 응답 모양으로 (글 조각마다 onDelta) */
async function readStream(body: ReadableStream<Uint8Array>, onDelta: OnDelta): Promise<ChatResponse> {
  let text = "";
  let finish: string | undefined;
  try {
    for await (const data of sseData(body)) {
      if (data.trim() === "[DONE]") break;
      const chunk = parseJson<StreamChunk>(data);
      if (!chunk) continue;
      if (chunk.error) throw new AgentError("AGENT_ERROR", "DeepSeek에서 오류가 났습니다. 다시 시도해 주세요.", chunk.error.message);
      const c = chunk.choices?.[0];
      if (c?.finish_reason) finish = c.finish_reason;
      const piece = c?.delta?.content ?? "";
      if (piece) {
        text += piece;
        onDelta(piece);
      }
    }
  } catch (e) {
    throw netError(e);
  }
  return { choices: [{ message: { content: text }, finish_reason: finish }] };
}

async function call(content: Content[], signal: AbortSignal, onDelta?: OnDelta) {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY ?? ""}` },
      body: JSON.stringify({
        model: deepseekModel(),
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        max_tokens: 6144, // 출력 상한 (본문 900~1600자 + JSON 여유, 비용 상한 역할)
        temperature: 0.8,
        stream: !!onDelta,
      }),
      signal,
    });
  } catch (e) {
    throw netError(e);
  }
  if (res.ok && onDelta && res.body) return { res, json: await readStream(res.body, onDelta) };
  return { res, json: (await res.json().catch(() => ({}))) as ChatResponse };
}

export async function runDeepseek(
  buildPrompt: (canSeeImages: boolean) => string,
  images: { data: string; mimeType: string }[],
  { timeoutMs = 150_000, signal, onDelta }: { timeoutMs?: number; signal?: AbortSignal; onDelta?: OnDelta } = {},
): Promise<{ text: string; imagesSent: boolean }> {
  const ctrl = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  const withImages = deepseekSendsImages() && images.length > 0;

  const content = (canSee: boolean): Content[] => {
    const c: Content[] = [{ type: "text", text: buildPrompt(canSee) }];
    if (canSee) {
      images.forEach((img, i) => {
        c.push({ type: "text", text: `[사진${i + 1}]` });
        c.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
      });
    }
    return c;
  };

  let imagesSent = withImages;
  let { res, json } = await call(content(withImages), ctrl, onDelta);
  // 사진 입력을 지원하지 않는 모델이면 글만으로 재시도
  if (withImages && res.status === 400 && /image|vision|multimodal|content type|unsupported/i.test(json.error?.message ?? "")) {
    imagesSent = false;
    ({ res, json } = await call(content(false), ctrl, onDelta));
  }

  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new AgentError("AUTH_REQUIRED", "DeepSeek API 키가 올바르지 않습니다. 키 설정을 확인해 주세요.", msg);
    if (res.status === 402) throw new AgentError("AUTH_REQUIRED", "DeepSeek 계정 잔액이 부족합니다. 충전 후 다시 시도해 주세요.", msg);
    if (res.status === 429) throw new AgentError("RATE_LIMITED", "DeepSeek 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.", msg);
    throw new AgentError("AGENT_ERROR", "DeepSeek에서 오류가 났습니다. 다시 시도해 주세요.", `HTTP ${res.status}: ${msg}`);
  }

  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") throw new AgentError("INCOMPLETE", "응답이 너무 길어 중간에 끊겼습니다.");
  if (choice?.finish_reason === "content_filter") {
    throw new AgentError("INCOMPLETE", "DeepSeek 안전 필터에 걸렸습니다. 입력 내용이나 사진을 확인해 주세요.");
  }
  if (!text.trim()) throw new AgentError("INCOMPLETE", "DeepSeek이 빈 응답을 보냈습니다. 다시 시도해 주세요.");
  return { text, imagesSent };
}
