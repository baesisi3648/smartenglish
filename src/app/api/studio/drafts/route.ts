import { NextResponse, type NextRequest } from "next/server";
import type { PromptImage } from "@/studio/acp-run";
import { getStyleExamples } from "@/studio/examples";
import { getPostType, sanitizeKeywords } from "@/studio/post-types";
import { buildPrompt, parseDraft } from "@/studio/prompt";
import { checkQuota, checkStudioRequest, errorResponse, fail, resolveAgent, runModel } from "@/studio/request";
import { assemble } from "@/studio/template";

export const maxDuration = 300;

// Vercel 함수 요청 본문 한도는 4.5MB → 화면에서 사진을 줄여(긴 변 1600px JPEG) 보낸다
const MAX_BODY_BYTES = process.env.VERCEL ? 4.4 * 1024 * 1024 : 35 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FIELD_CHARS = 2000;
/** 실제 파일 시그니처(앞부분 바이트)로 형식 확인 — 브라우저가 보낸 MIME 표시는 믿지 않는다 */
function sniffImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").slice(0, MAX_FIELD_CHARS);

/** POST /api/studio/drafts — 블로그 초안 생성 (ChatGPT·Claude: 원장 PC 로컬 전용 / Gemini·DeepSeek: 웹) */
export async function POST(req: NextRequest) {
  const denied = checkStudioRequest(req);
  if (denied) return denied;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "업로드 용량이 너무 큽니다.");

  const form = await req.formData();
  const type = getPostType(text(form, "type"));
  const topic = text(form, "topic").trim();
  const memo = text(form, "memo");
  const rawKeywords = form.getAll("keywords").map((v) => String(v));
  const consent = form.get("consent") === "yes";

  const agent = resolveAgent(req, text(form, "agent"));
  if ("error" in agent) return agent.error;
  const { def } = agent;
  if (!type) return fail(400, "INVALID_TYPE", "글 유형을 선택해 주세요.");
  if (!topic) return fail(400, "TOPIC_REQUIRED", "주제 및 내용을 입력해 주세요.");

  const values: Record<string, string> = {};
  for (const f of type.fields) {
    // 화면은 "주제 및 내용·요청사항" 한 칸으로 단순화 → 유형별 세부 칸은 선택(구버전 호환)
    values[f.key] = text(form, `f_${f.key}`);
  }

  const files = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > 0 && !consent) {
    return fail(400, "CONSENT_REQUIRED", "사진 속 개인정보 가림 및 보호자 동의 확인에 체크해 주세요.");
  }
  if (files.length > MAX_IMAGES) return fail(400, "TOO_MANY_IMAGES", `사진은 최대 ${MAX_IMAGES}장까지 가능합니다.`);

  const images: PromptImage[] = [];
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_IMAGE_BYTES) return fail(400, "IMAGE_TOO_LARGE", `사진${i + 1}: 5MB 이하로 줄여 주세요.`);
    const buf = Buffer.from(await f.arrayBuffer());
    const mimeType = sniffImage(buf);
    if (!mimeType) return fail(400, "INVALID_IMAGE", `사진${i + 1}: JPG·PNG·WEBP 사진만 올릴 수 있습니다.`);
    images.push({ data: buf.toString("base64"), mimeType });
  }

  const picked = sanitizeKeywords(rawKeywords);
  const keywords = picked.length > 0 ? picked : [type.defaultKeyword];

  // 퓨샷: 같은 유형의 최근 블로그 글 (1시간 캐시, 실패 시 고정 예시)
  const examples = await getStyleExamples(type.id);
  const prompt = (canSee: boolean) =>
    buildPrompt({ type, topic, values, memo, keywords, imageCount: images.length, imagesAttached: canSee, examples });

  const overQuota = checkQuota(req, def);
  if (overQuota) return overQuota;

  try {
    // ACP: 에이전트의 이미지 지원 여부를 확인한 뒤 프롬프트를 구성 — 생성은 한 번만
    const run = await runModel(def, prompt, images, req.signal);
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
        ...assemble(draft, keywords),
        keywords,
        agent: def.id,
        imagesSeen: run.imagesSent,
        examplesUsed: examples.length,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
