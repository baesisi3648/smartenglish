import { NextResponse, type NextRequest } from "next/server";
import { runBlogAgent, type AgentStep } from "@/studio/blog-agent";
import { redactSecrets } from "@/studio/errors";
import { takeApiQuota } from "@/studio/guard";
import { checkQuota, checkStudioRequest, errorResponse, fail, redactDeep, resolveAgent } from "@/studio/request";

export const maxDuration = 300;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_INSTRUCTION_CHARS = 600;

/**
 * POST /api/studio/agent — 블로그 에이전트에게 지시 → 데이터 조사·계획·초안·검수·고쳐 쓰기를 스스로 진행.
 * 응답: NDJSON 줄 스트림. {"t":"step","step":{...}} 를 진행하는 대로 보내고, 마지막 줄 {"t":"end","status","body"}.
 */
export async function POST(req: NextRequest) {
  const denied = checkStudioRequest(req);
  if (denied) return denied;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");

  const input = (await req.json().catch(() => null)) as { agent?: unknown; instruction?: unknown } | null;
  if (!input) return fail(400, "INVALID_BODY", "요청 형식이 올바르지 않습니다.");
  const agent = resolveAgent(req, String(input.agent ?? ""));
  if ("error" in agent) return agent.error;
  const instruction = String(input.instruction ?? "").slice(0, MAX_INSTRUCTION_CHARS).trim();
  if (!instruction) return fail(400, "INSTRUCTION_REQUIRED", "에이전트에게 맡길 일을 적어 주세요.");

  const overQuota = checkQuota(req, agent);
  if (overQuota) return overQuota;
  // 서버 키 AI는 무거운 호출(쓰기·고치기)마다 사용량을 한 번 더 센다 — 첫 쓰기는 위에서 센 것으로
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  let heavy = 0;
  const allowHeavy = () => agent.def.kind !== "api" || heavy++ === 0 || takeApiQuota(client);

  const enc = new TextEncoder();
  const abort = new AbortController();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      // 화면에 보내는 모든 글은 비밀값 가림을 거친다
      const emit = (step: AgentStep) => write({ t: "step", step: redactDeep(step) });
      runBlogAgent({ instruction, agent, signal: AbortSignal.any([req.signal, abort.signal]), emit, allowHeavy })
        .then((r) => {
          if (!r.draft) return NextResponse.json({ success: false, code: "NO_DRAFT", error: redactSecrets(r.summary) }, { status: 422 });
          return NextResponse.json({ success: true, data: redactDeep({ ...r.draft, summary: r.summary, checks: r.checks, agent: agent.def.id }) });
        })
        .catch((e) => errorResponse(e))
        .then(async (res) => write({ t: "end", status: res.status, body: await res.json() }))
        .finally(() => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel() {
      closed = true;
      abort.abort(); // 화면을 떠나면 AI 호출도 멈춤
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
