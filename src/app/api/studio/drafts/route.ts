import { NextResponse, type NextRequest } from "next/server";
import { AGENTS, type AgentId } from "@/studio/agents";
import { AgentError, runAgent, type PromptImage } from "@/studio/acp-run";
import { studioEnabled, isTrustedStudioRequest } from "@/studio/guard";
import { verifySessionToken, SESSION_COOKIE } from "@/studio/auth";
import { getPostType, sanitizeKeywords } from "@/studio/post-types";
import { buildPrompt, parseDraft } from "@/studio/prompt";
import { assemble } from "@/studio/template";

export const maxDuration = 300;

const MAX_BODY_BYTES = 35 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FIELD_CHARS = 2000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const STATUS: Record<AgentError["code"], number> = {
  AUTH_REQUIRED: 401,
  BUSY: 409,
  TIMEOUT: 504,
  INCOMPLETE: 502,
  SPAWN_FAILED: 502,
  AGENT_ERROR: 502,
};

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").slice(0, MAX_FIELD_CHARS);

/** POST /api/studio/drafts — 블로그 초안 생성 (원장 PC 로컬 전용) */
export async function POST(req: NextRequest) {
  if (!studioEnabled() || !isTrustedStudioRequest(req.headers)) {
    return fail(404, "NOT_FOUND", "Not found");
  }
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return fail(401, "LOGIN_REQUIRED", "로그인이 만료되었습니다. 새로고침 후 비밀번호를 다시 입력해 주세요.");
  }
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "업로드 용량이 너무 큽니다.");

  const form = await req.formData();
  const agentId = text(form, "agent") as AgentId;
  const type = getPostType(text(form, "type"));
  const topic = text(form, "topic").trim();
  const memo = text(form, "memo");
  const rawKeywords = form.getAll("keywords").map((v) => String(v));
  const consent = form.get("consent") === "yes";

  if (!AGENTS[agentId]) return fail(400, "INVALID_AGENT", "AI를 선택해 주세요.");
  if (!type) return fail(400, "INVALID_TYPE", "글 유형을 선택해 주세요.");
  if (!topic) return fail(400, "TOPIC_REQUIRED", "주제를 입력해 주세요.");

  const values: Record<string, string> = {};
  for (const f of type.fields) {
    values[f.key] = text(form, `f_${f.key}`);
    if (f.required && !values[f.key].trim()) return fail(400, "FIELD_REQUIRED", `'${f.label}'을(를) 입력해 주세요.`);
  }

  const files = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > 0 && !consent) {
    return fail(400, "CONSENT_REQUIRED", "사진 속 개인정보 가림 및 보호자 동의 확인에 체크해 주세요.");
  }
  if (files.length > MAX_IMAGES) return fail(400, "TOO_MANY_IMAGES", `사진은 최대 ${MAX_IMAGES}장까지 가능합니다.`);

  const images: PromptImage[] = [];
  for (const f of files) {
    if (!IMAGE_TYPES.has(f.type)) return fail(400, "INVALID_IMAGE", `${f.name}: 지원하지 않는 형식입니다.`);
    if (f.size > MAX_IMAGE_BYTES) return fail(400, "IMAGE_TOO_LARGE", `${f.name}: 5MB 이하로 줄여 주세요.`);
    images.push({ data: Buffer.from(await f.arrayBuffer()).toString("base64"), mimeType: f.type });
  }

  const picked = sanitizeKeywords(rawKeywords);
  const keywords = picked.length > 0 ? picked : [type.defaultKeyword];

  try {
    // 에이전트의 이미지 지원 여부를 확인한 뒤 프롬프트를 구성 — 생성은 한 번만
    const run = await runAgent(
      agentId,
      (canSee) =>
        buildPrompt({ type, topic, values, memo, keywords, imageCount: images.length, imagesAttached: canSee }),
      images,
      { signal: req.signal },
    );
    const draft = parseDraft(run.text);
    if (!draft) {
      return NextResponse.json(
        { success: false, code: "PARSE_FAILED", error: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.", raw: run.text.slice(0, 4000) },
        { status: 502 },
      );
    }
    return NextResponse.json({
      success: true,
      data: { ...assemble(draft, keywords), keywords, agent: agentId, imagesSeen: run.imagesSent },
    });
  } catch (e) {
    if (e instanceof AgentError) return fail(STATUS[e.code], e.code, e.message);
    return fail(500, "INTERNAL", e instanceof Error ? e.message : "알 수 없는 오류");
  }
}
