import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAgent, type PromptImage } from "./acp-run";
import { AGENTS, isAgentId, type AgentDef } from "./agents";
import { verifySessionToken, SESSION_COOKIE } from "./auth";
import { runDeepseek } from "./deepseek-api";
import { AgentError, redactSecrets } from "./errors";
import { runGemini } from "./gemini-api";
import { DEFAULT_OPENAI_MODEL, OPENAI_KEY_PATTERN, isOpenAIModel } from "./openai-models";
import { openaiServerKey, runOpenAI } from "./openai-api";
import { availableAgents, isTrustedStudioRequest, studioEnabled, takeApiQuota } from "./guard";

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
 * GPT 키: 화면에 넣은 키(헤더, browser)가 우선, 없으면 서버 환경변수 OPENAI_API_KEY(server).
 * 화면 키는 헤더로만 받는다 (URL·본문·로그에 남지 않게).
 */
export type Byok = { apiKey: string; model: string; source: "browser" | "server" };
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
  const fromBrowser = req.headers.get("x-openai-key")?.trim() ?? "";
  if (fromBrowser) return OPENAI_KEY_PATTERN.test(fromBrowser) ? { apiKey: fromBrowser, model, source: "browser" } : null;
  const fromServer = openaiServerKey();
  return fromServer ? { apiKey: fromServer, model, source: "server" } : null;
}

/** 서버 키로 부르는 AI(Gemini·DeepSeek, 서버 env의 GPT 키)는 시간당 사용량 제한 (키 비용 보호). 화면에 넣은 본인 키는 제외. 통과하면 null */
export function checkQuota(req: NextRequest, { def, byok }: ResolvedAgent) {
  if (def.kind === "acp" || (def.kind === "byok" && byok?.source === "browser")) return null;
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (takeApiQuota(client)) return null;
  return fail(429, "RATE_LIMITED", "1시간 동안 쓸 수 있는 AI 요청 수(20건)를 넘었습니다. 잠시 뒤 다시 시도해 주세요.");
}

/** AI 1회 실행. 출력에 서버 비밀값이 섞여 나오는 경우(프롬프트 주입 등) 대비해 가린 뒤 돌려준다 */
export async function runModel(
  { def, byok }: ResolvedAgent,
  buildPrompt: (canSeeImages: boolean) => string,
  images: PromptImage[],
  signal: AbortSignal,
) {
  const run =
    def.kind === "acp"
      ? await runAgent(def.id, buildPrompt, images, { signal })
      : def.kind === "byok"
        ? await runOpenAI(buildPrompt(true), images, { apiKey: byok!.apiKey, model: byok!.model, signal })
        : def.id === "gemini"
          ? await runGemini(buildPrompt(true), images, { signal })
          : await runDeepseek(buildPrompt, images, { signal });
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
