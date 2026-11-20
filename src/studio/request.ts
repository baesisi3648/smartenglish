import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAgent, type PromptImage } from "./acp-run";
import { AGENTS, isAgentId, type AgentDef } from "./agents";
import { verifySessionToken, SESSION_COOKIE } from "./auth";
import { runDeepseek } from "./deepseek-api";
import { AgentError, redactSecrets, secretHold } from "./errors";
import { partialField } from "./partial-json";
import { runGemini } from "./gemini-api";
import type { OnDelta } from "./sse";
import { DEFAULT_OPENAI_MODEL, OPENAI_KEY_PATTERN, isOpenAIModel } from "./openai-models";
import { openaiTrialKey, runOpenAI } from "./openai-api";
import { TRIAL_PER_DAY, availableAgents, isTrustedStudioRequest, refundTrialQuota, studioEnabled, takeApiQuota, takeTrialQuota } from "./guard";

/** 스튜디오 API 라우트(초안·글 추천) 공통: 요청 검사, AI 실행, 오류 응답 */

export function fail(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

/** 출처·로그인 검사. 통과하면 null, 아니면 바로 돌려줄 응답 */
export function checkStudioRequest(req: NextRequest) {
  if (!studioEnabled() || !isTrustedStudioRequest(req.headers, { local: false })) {
    return fail(404, "NOT_FOUND", "Not found");
  }
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return fail(401, "LOGIN_REQUIRED", "로그인이 만료되었습니다. 새로고침 후 비밀번호를 다시 입력해 주세요.");
  }
  return null;
}

/**
 * GPT(내 API 키, BYOK): 원장님이 화면에 넣은 키를 쓴다.
 * (서버 OpenAI 키는 "GPT 체험" 전용 — 하루 10회 제한, AI 그림 불가)
 * 키는 헤더로만 받는다 (URL·본문·로그에 남지 않게).
 */
export type Byok = { apiKey: string; model: string };
export type ResolvedAgent = { def: AgentDef; byok?: Byok };

/** 고른 AI 확인. PC 프로그램을 실행하는 AI(ACP)는 localhost 출처만 허용 */
export function resolveAgent(req: NextRequest, agentId: string): ResolvedAgent | { error: NextResponse } {
  if (!isAgentId(agentId) || !availableAgents().some((a) => a.id === agentId)) {
    return { error: fail(400, "INVALID_AGENT", "AI를 선택해 주세요.") };
  }
  const def = AGENTS[agentId];
  if (def.kind === "acp" && !isTrustedStudioRequest(req.headers, { local: true })) {
    return { error: fail(404, "NOT_FOUND", "Not found") };
  }
  if (def.kind === "byok") {
    const byok = readByok(req);
    if (!byok) return { error: fail(400, "API_KEY_REQUIRED", "OpenAI API 키(sk-로 시작)를 1번 칸에 입력해 주세요.") };
    return { def, byok };
  }
  return { def };
}

export function readByok(req: NextRequest): Byok | null {
  const m = req.headers.get("x-openai-model") ?? "";
  const model = isOpenAIModel(m) ? m : DEFAULT_OPENAI_MODEL;
  const apiKey = req.headers.get("x-openai-key")?.trim() ?? "";
  return OPENAI_KEY_PATTERN.test(apiKey) ? { apiKey, model } : null;
}

/** 서버 API 키로 부르는 AI(Gemini·DeepSeek)는 시간당 사용량 제한 (키 비용 보호). 본인 키(BYOK)·PC 구독은 제외. 통과하면 null */
export function checkQuota(req: NextRequest, { def }: ResolvedAgent) {
  if (def.kind !== "api") return null;
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (!takeApiQuota(client)) {
    return fail(429, "RATE_LIMITED", "1시간 동안 쓸 수 있는 AI 요청 수(20건)를 넘었습니다. 잠시 뒤 다시 시도해 주세요.");
  }
  if (def.id === "gpt" && takeTrialQuota() < 0) {
    return fail(
      429,
      "DAILY_LIMIT",
      `오늘 GPT 체험 ${TRIAL_PER_DAY}회를 모두 썼습니다. 내일 다시 쓰거나, 'GPT (내 API 키)' 또는 다른 AI를 골라 주세요.`,
    );
  }
  return null;
}

/** AI 1회 실행. 출력에 서버 비밀값이 섞여 나오는 경우(프롬프트 주입 등) 대비해 가린 뒤 돌려준다 */
export async function runModel(
  { def, byok }: ResolvedAgent,
  buildPrompt: (canSeeImages: boolean) => string,
  images: PromptImage[],
  signal: AbortSignal,
  /** 있으면 AI가 쓰는 글 조각을 받는 대로 넘긴다 (화면 스트리밍) */
  onDelta?: OnDelta,
) {
  if (def.id === "gpt") {
    try {
      const run = await runOpenAI(buildPrompt(true), images, { apiKey: openaiTrialKey(), model: DEFAULT_OPENAI_MODEL, signal, onDelta });
      return { text: redactSecrets(run.text), imagesSent: run.imagesSent };
    } catch (e) {
      refundTrialQuota(); // 실패한 요청은 하루 횟수에서 빼지 않는다
      throw e;
    }
  }
  const run =
    def.kind === "acp"
      ? await runAgent(def.id, buildPrompt, images, { signal, onDelta })
      : def.kind === "byok"
        ? await runOpenAI(buildPrompt(true), images, { apiKey: byok!.apiKey, model: byok!.model, signal, onDelta })
        : def.id === "gemini"
          ? await runGemini(buildPrompt(true), images, { signal, onDelta })
          : await runDeepseek(buildPrompt, images, { signal, onDelta });
  return { text: redactSecrets(run.text), imagesSent: run.imagesSent };
}

const STATUS: Record<AgentError["code"], number> = {
  AUTH_REQUIRED: 401,
  BUSY: 409,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  INCOMPLETE: 502,
  SPAWN_FAILED: 502,
  AGENT_ERROR: 502,
};

/** 진단 정보는 서버 로그에만(비밀값 가림), 화면에는 고정 문구 + 문의용 번호 */
function logIncident(code: string, detail: string | undefined) {
  const id = randomUUID().slice(0, 8);
  console.error(`[studio] ${id} ${code} ${redactSecrets(detail ?? "")}`.slice(0, 2000));
  return id;
}

export function errorResponse(e: unknown) {
  if (e instanceof AgentError) {
    if (!e.detail) return fail(STATUS[e.code], e.code, e.message);
    const id = logIncident(e.code, e.detail);
    return fail(STATUS[e.code], e.code, `${e.message} (오류 번호 ${id})`);
  }
  const id = logIncident("INTERNAL", e instanceof Error ? (e.stack ?? e.message) : String(e));
  return fail(500, "INTERNAL", `알 수 없는 오류가 났습니다. 다시 시도해 주세요. (오류 번호 ${id})`);
}

/** 화면이 스트리밍(쓰는 대로 보기)을 요청했는지 */
export function wantsStream(req: NextRequest) {
  return req.headers.get("x-stream") === "1";
}

const STREAM_FLUSH_MS = 120;
const STREAM_FIELDS = ["title", "body"] as const;

/**
 * 결과는 기존 JSON 응답 그대로 두고, 그 전에 AI가 쓰는 제목·본문을 NDJSON 줄로 흘려보낸다.
 *   {"t":"d","f":"body","v":"이어 쓴 글"}  {"t":"r","f":"body","v":"전체 글"}  {"t":"end","status":200,"body":{...기존 응답}}
 * 보안: AI 원문(JSON)을 그대로 보내지 않고, 서버에서 항목 값을 풀어(\u 이스케이프 등 디코딩) redactSecrets 를 거친 뒤 보낸다.
 * 아직 안 닫힌 항목은 끝에서 secretHold()자(가장 긴 비밀값보다 김)를 보류해, 비밀값의 앞부분만 먼저 나가는 일을 막는다.
 * 화면이 연결을 끊으면 work 에 넘긴 signal 이 취소된다 (AI 호출도 중단).
 */
export function streamResponse(work: (onDelta: OnDelta, signal: AbortSignal) => Promise<Response>) {
  const enc = new TextEncoder();
  const abort = new AbortController();
  const hold = secretHold();
  let acc = "";
  const sent: Record<string, string> = { title: "", body: "" };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true; // 화면이 연결을 끊음
        }
      };
      const flush = () => {
        timer = null;
        if (closed) return;
        for (const f of STREAM_FIELDS) {
          const { value, done } = partialField(acc, f);
          const red = redactSecrets(value);
          const stable = done ? red : red.slice(0, Math.max(0, red.length - hold));
          if (stable === sent[f]) continue;
          if (stable.startsWith(sent[f])) write({ t: "d", f, v: stable.slice(sent[f].length) });
          else write({ t: "r", f, v: stable }); // 가림 등으로 앞부분이 달라지면 전체를 다시 보냄
          sent[f] = stable;
        }
      };
      const onDelta: OnDelta = (t) => {
        if (closed) return;
        acc += t;
        if (!timer) timer = setTimeout(flush, STREAM_FLUSH_MS);
      };
      work(onDelta, abort.signal)
        .catch((e) => errorResponse(e))
        .then(async (res) => {
          if (timer) clearTimeout(timer);
          write({ t: "end", status: res.status, body: await res.json().catch(() => ({ success: false, error: "응답 오류" })) });
        })
        .finally(() => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
      abort.abort(); // 화면이 떠나면 AI 호출도 멈춤
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * 파싱한 결과(제목·본문·태그·메모 등)의 모든 문자열에 비밀값 가림을 한 번 더 적용한다.
 * runModel 은 AI 원문을 가리지만, JSON 이스케이프(\u002d 등)로 쓴 값은 파싱 뒤에야 원래 글자가 되므로.
 */
export function redactDeep<T>(v: T): T {
  if (typeof v === "string") return redactSecrets(v) as T;
  if (Array.isArray(v)) return v.map(redactDeep) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)])) as T;
  return v;
}

/** GPT 체험: AI는 답했지만 결과를 쓸 수 없을 때(형식 오류) 하루 횟수를 돌려준다 */
export function refundIfTrial({ def }: ResolvedAgent) {
  if (def.id === "gpt") refundTrialQuota();
}
