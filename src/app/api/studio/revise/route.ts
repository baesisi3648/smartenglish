import { NextResponse, type NextRequest } from "next/server";
import { sanitizeKeywords } from "@/studio/post-types";
import { buildRevisePrompt, parseDraft } from "@/studio/prompt";
import { checkQuota, checkStudioRequest, errorResponse, fail, resolveAgent, runModel, streamResponse, wantsStream } from "@/studio/request";
import type { OnDelta } from "@/studio/sse";
import { coreBody, withKeyword, wrapBody } from "@/studio/template";

export const maxDuration = 300;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_POST_CHARS = 8000;
const MAX_INSTRUCTION_CHARS = 500;
const MAX_TOPIC_CHARS = 2000;

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

/** POST /api/studio/revise — 초안을 원장님의 자연어 요청대로 고친다 ("두 번째 문단을 더 짧게" 등) */
export async function POST(req: NextRequest) {
  const denied = checkStudioRequest(req);
  if (denied) return denied;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");

  const input = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input) return fail(400, "INVALID_BODY", "요청 형식이 올바르지 않습니다.");

  const agent = resolveAgent(req, str(input.agent, 20));
  if ("error" in agent) return agent.error;

  const instruction = str(input.instruction, MAX_INSTRUCTION_CHARS).trim();
  if (!instruction) return fail(400, "INSTRUCTION_REQUIRED", "어떻게 고칠지 적어 주세요.");
  const body = coreBody(str(input.body, MAX_POST_CHARS));
  if (!body) return fail(400, "BODY_REQUIRED", "고칠 본문이 없습니다.");
  const keyword = sanitizeKeywords([str(input.keyword, 40)])[0] ?? "";
  const title = withKeyword(str(input.title, 120), "");
  const topic = str(input.topic, MAX_TOPIC_CHARS).trim();

  const overQuota = checkQuota(req, agent);
  if (overQuota) return overQuota;

  // 결과 만들기 (스트리밍이면 쓰는 대로 화면에 보내고, 끝나면 같은 JSON을 마지막 줄로)
  const produce = async (onDelta?: OnDelta) => {
    try {
      const prompt = buildRevisePrompt({ title, body, instruction, topic });
      const run = await runModel(agent, () => prompt, [], req.signal, onDelta);
      const draft = parseDraft(run.text);
      if (!draft) {
        return NextResponse.json(
          { success: false, code: "PARSE_FAILED", error: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.", raw: run.text.slice(0, 4000) },
          { status: 502 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          title: withKeyword(draft.title || title, keyword),
          body: wrapBody(draft.body),
          notes: draft.notes,
          changes: draft.changes ?? [],
          // 본문·제목이 그대로면 화면에서 "반영되지 않았어요"로 알린다
          unchanged: draft.body.trim() === body.trim() && (draft.title || title).trim() === title.trim(),
        },
      });
    } catch (e) {
      return errorResponse(e);
    }
  };
  return wantsStream(req) ? streamResponse(produce) : produce();
}
