import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { AGENTS, type AgentId } from "./agents";

export type PromptImage = { data: string; mimeType: string };

const AUTH_RE = /auth|login|log in|credential|api key|unauthori[sz]ed/i;
const MAX_OUTPUT_CHARS = 60_000;

/** 구독 로그인만 쓰도록 API 키·클라우드 인증 환경변수는 자식 프로세스에 넘기지 않는다 */
const BLOCKED_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_USE_VERTEXAI",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "STUDIO_ENABLED",
];

export class AgentError extends Error {
  constructor(
    public code: "SPAWN_FAILED" | "AUTH_REQUIRED" | "TIMEOUT" | "AGENT_ERROR" | "INCOMPLETE" | "BUSY",
    message: string,
  ) {
    super(message);
  }
}

/** 동시에 한 건만 실행 (원장 PC 자원 보호) */
let busy = false;

/** Windows는 shell:true 로 띄운 npx의 하위 node까지 트리째 종료해야 한다 */
function killTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || !child.pid) return resolve();
    if (process.platform === "win32") {
      const k = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      k.on("exit", () => resolve());
      k.on("error", () => resolve());
    } else {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3000).unref();
    }
  });
}

/**
 * ACP로 에이전트를 1회 실행하고, 에이전트가 보낸 텍스트 전체를 반환한다.
 * - buildPrompt 는 에이전트의 이미지 지원 여부를 받아 프롬프트를 만든다 (실행은 한 번).
 * - 도구 사용 권한 요청은 모두 거절하고, fs/terminal capability를 광고하지 않는다.
 *   (주의: 에이전트 내장 읽기 도구까지 완전히 막지는 못함 — 빈 임시 폴더에서 실행)
 */
export async function runAgent(
  agentId: AgentId,
  buildPrompt: (canSeeImages: boolean) => string,
  images: PromptImage[],
  { timeoutMs = 240_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; imagesSent: boolean }> {
  if (busy) throw new AgentError("BUSY", "다른 초안을 생성 중입니다. 끝난 뒤 다시 시도해 주세요.");
  const def = AGENTS[agentId];
  const cwd = await mkdtemp(path.join(tmpdir(), "hb-studio-"));
  busy = true;
  const env = { ...process.env };
  for (const k of BLOCKED_ENV) delete env[k];

  // command/args 는 코드에 고정된 값만 사용 (사용자 입력 없음)
  const child = spawn(def.command, def.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32", // Windows에서 npx(.cmd) 실행
    env,
  });

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });

  let timer: NodeJS.Timeout | undefined;
  const failures = new Promise<never>((_, reject) => {
    child.once("error", (e) => reject(new AgentError("SPAWN_FAILED", `${def.label} 실행 실패: ${e.message}`)));
    child.once("exit", (code) => {
      if (code !== 0 && code !== null)
        reject(new AgentError("AGENT_ERROR", `${def.label}가 종료되었습니다 (code ${code}). ${stderr.slice(-500)}`));
    });
    timer = setTimeout(() => reject(new AgentError("TIMEOUT", `${def.label} 응답 시간 초과`)), timeoutMs);
    signal?.addEventListener("abort", () => reject(new AgentError("AGENT_ERROR", "요청이 취소되었습니다.")), { once: true });
  });

  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
  );

  let text = "";
  const app = acp
    .client({ name: "haebeop-blog-studio" })
    .onNotification(acp.methods.client.session.update, ({ params }) => {
      const u = params.update;
      if (u.sessionUpdate === "agent_message_chunk" && u.content.type === "text" && text.length < MAX_OUTPUT_CHARS) {
        text += u.content.text;
      }
    })
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
      const reject = params.options.find((o) => o.kind === "reject_once" || o.kind === "reject_always");
      return reject
        ? { outcome: { outcome: "selected", optionId: reject.optionId } }
        : { outcome: { outcome: "cancelled" } };
    });

  const work = app.connectWith(stream, async (ctx) => {
    const init = await ctx.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "haebeop-blog-studio", version: "0.1.0" },
    });
    const canImage = Boolean(init.agentCapabilities?.promptCapabilities?.image);

    const newSession = () => ctx.request(acp.methods.agent.session.new, { cwd, mcpServers: [] });
    let session;
    try {
      session = await newSession();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!AUTH_RE.test(msg)) throw new AgentError("AGENT_ERROR", msg);
      // 구독 로그인 방식(이미 CLI에 저장된 로그인)으로만 인증 시도 — API 키/Vertex/게이트웨이 제외
      const offered = new Set((init.authMethods ?? []).map((m) => m.id));
      for (const methodId of def.authMethods.filter((id) => offered.has(id))) {
        try {
          await ctx.request(acp.methods.agent.authenticate, { methodId });
          session = await newSession();
          break;
        } catch {
          /* 다음 방식 */
        }
      }
      if (!session) throw new AgentError("AUTH_REQUIRED", `${def.label} 로그인이 필요합니다. ${def.loginHelp}`);
    }

    const sendImages = canImage && images.length > 0;
    const prompt: acp.ContentBlock[] = [{ type: "text", text: buildPrompt(canImage) }];
    if (sendImages) {
      images.forEach((img, i) => {
        prompt.push({ type: "text", text: `[사진${i + 1}]` });
        prompt.push({ type: "image", data: img.data, mimeType: img.mimeType });
      });
    }

    const res = await ctx.request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt });
    if (res.stopReason !== "end_turn") {
      const why: Record<string, string> = {
        max_tokens: "응답이 너무 길어 중간에 끊겼습니다.",
        max_turn_requests: "에이전트가 작업 한도에 도달했습니다.",
        refusal: "AI가 요청을 거절했습니다. 입력 내용을 확인해 주세요.",
        cancelled: "생성이 취소되었습니다.",
      };
      throw new AgentError("INCOMPLETE", why[res.stopReason] ?? `비정상 종료: ${res.stopReason}`);
    }
    return { text, imagesSent: sendImages };
  });

  try {
    return await Promise.race([work, failures]);
  } catch (e) {
    if (e instanceof AgentError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (AUTH_RE.test(msg)) throw new AgentError("AUTH_REQUIRED", `${def.label} 로그인이 필요합니다. ${def.loginHelp}`);
    throw new AgentError("AGENT_ERROR", `${msg} ${stderr.slice(-300)}`.trim());
  } finally {
    clearTimeout(timer);
    await killTree(child);
    await rm(cwd, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    busy = false;
  }
}
