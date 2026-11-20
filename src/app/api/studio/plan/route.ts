import { NextResponse, type NextRequest } from "next/server";
import { getLatestPosts } from "@/lib/blog";
import { PLANNER_OPENAI_MODEL } from "@/studio/openai-models";
import { analyzePosts, buildPlanPrompt, parsePlan, todayKst, upcomingSeasons } from "@/studio/planner";
import { checkQuota, checkStudioRequest, errorResponse, fail, redactDeep, refundIfTrial, resolveAgent, runModel } from "@/studio/request";

export const maxDuration = 300;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_MEMO_CHARS = 500;

/** POST /api/studio/plan — 콘텐츠 플래너: 시기·블로그 현황을 보고 이번 주 글 3개 제안 */
export async function POST(req: NextRequest) {
  const denied = checkStudioRequest(req);
  if (denied) return denied;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");

  const body = (await req.json().catch(() => null)) as { agent?: unknown; memo?: unknown } | null;
  if (!body) return fail(400, "INVALID_BODY", "요청 형식이 올바르지 않습니다.");
  const agent = resolveAgent(req, String(body.agent ?? ""));
  if ("error" in agent) return agent.error;
  const { def } = agent;
  const memo = String(body.memo ?? "").slice(0, MAX_MEMO_CHARS);

  // 1) 자료 수집: 날짜·학사 시기, 블로그 최근 글 (RSS, 1시간 캐시)
  const today = todayKst();
  const seasons = upcomingSeasons(today);
  const posts = await getLatestPosts(30);
  const analysis = analyzePosts(posts, today);
  const context = {
    postsAnalyzed: posts.length,
    last30: analysis.last30,
    seasons: seasons.map((s) => s.label),
    types: analysis.types,
  };

  const overQuota = checkQuota(req, agent);
  if (overQuota) return overQuota;

  try {
    // 2) 판단: AI가 이번 주 글 3개 제안
    const prompt = buildPlanPrompt({ today, seasons, analysis, postsAnalyzed: posts.length, memo });
    // GPT: 플래너는 여러 자료를 엮어 판단해야 해서 Terra 고정 (초안은 화면에서 고른 모델)
    const planner = agent.byok ? { ...agent, byok: { ...agent.byok, model: PLANNER_OPENAI_MODEL } } : agent;
    const run = await runModel(planner, () => prompt, [], req.signal);
    const parsed = parsePlan(run.text);
    if (!parsed) {
      refundIfTrial(agent);
      return NextResponse.json(
        { success: false, code: "PARSE_FAILED", error: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 },
      );
    }
    const plan = redactDeep(parsed); // JSON 이스케이프로 숨긴 비밀값까지 가림
    return NextResponse.json({ success: true, data: { ...plan, context, agent: def.id } });
  } catch (e) {
    return errorResponse(e);
  }
}
