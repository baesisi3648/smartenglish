import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAgent, type PromptImage } from "./acp-run";
import { AGENTS, isAgentId, type AgentDef } from "./agents";
import { verifySessionToken, SESSION_COOKIE } from "./auth";
import { runDeepseek } from "./deepseek-api";
import { AgentError, redactSecrets } from "./errors";
import { runGemini } from "./gemini-api";
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

/** 고른 AI 확인. PC 프로그램을 실행하는 AI(ACP)는 localhost 출처만 허용 */
export function resolveAgent(req: NextRequest, agentId: string): { def: AgentDef } | { error: NextResponse } {
  if (!isAgentId(agentId) || !availableAgents().some((a) => a.id === agentId)) {
    return { error: fail(400, "INVALID_AGENT", "AI를 선택해 주세요.") };
  }
  const def = AGENTS[agentId];
  if (def.kind === "acp" && !isTrustedStudioRequest(req.headers, { local: true })) {
    return { error: fail(404, "NOT_FOUND", "Not found") };
  }
  return { def };
}

/** API 키로 부르는 AI는 시간당 사용량 제한 (키 비용 보호). 통과하면 null */
export function checkQuota(req: NextRequest, def: AgentDef) {
  if (def.kind !== "api") return null;
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (takeApiQuota(client)) return null;
  return fail(429, "RATE_LIMITED", "1시간 동안 쓸 수 있는 AI 요청 수(20건)를 넘었습니다. 잠시 뒤 다시 시도해 주세요.");
}

/** AI 1회 실행. 출력에 서버 비밀값이 섞여 나오는 경우(프롬프트 주입 등) 대비해 가린 뒤 돌려준다 */
export async function runModel(
  def: AgentDef,
  buildPrompt: (canSeeImages: boolean) => string,
  images: PromptImage[],
  signal: AbortSignal,
) {
  const run =
    def.kind === "acp"
      ? await runAgent(def.id, buildPrompt, images, { signal })
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
