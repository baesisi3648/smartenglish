import { NextResponse, type NextRequest } from "next/server";
import { generateImage } from "@/studio/openai-api";
import { checkStudioRequest, errorResponse, fail, readByok } from "@/studio/request";

export const maxDuration = 300;

const MAX_BODY_BYTES = 4 * 1024;
const MAX_DESC_CHARS = 300;

/** POST /api/studio/images — 초안의 [그림: 설명] 자리에 넣을 일러스트 1장 (GPT 내 API 키 전용) */
export async function POST(req: NextRequest) {
  const denied = checkStudioRequest(req);
  if (denied) return denied;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");

  const byok = readByok(req);
  if (!byok) return fail(400, "API_KEY_REQUIRED", "AI 그림은 GPT(내 API 키)에서만 만들 수 있습니다. OpenAI API 키를 입력해 주세요.");

  const body = (await req.json().catch(() => null)) as { description?: unknown } | null;
  const description = String(body?.description ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, MAX_DESC_CHARS);
  if (!description) return fail(400, "DESCRIPTION_REQUIRED", "그릴 장면 설명이 없습니다.");

  try {
    const image = await generateImage(description, { apiKey: byok.apiKey, signal: req.signal });
    return NextResponse.json({ success: true, data: { image } });
  } catch (e) {
    return errorResponse(e);
  }
}
