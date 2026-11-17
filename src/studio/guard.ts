import "server-only";
import { ACP_AGENTS, DEEPSEEK_AGENT, GEMINI_AGENT, OPENAI_AGENT, type AgentDef } from "./agents";
import { deepseekConfigured } from "./deepseek-api";
import { geminiConfigured } from "./gemini-api";

/**
 * 스튜디오에서 쓸 수 있는 AI:
 * - ChatGPT·Claude(ACP): 원장 PC에서만. `npm run studio` 가 STUDIO_ENABLED=1 을 설정하고, Vercel에서는 항상 꺼짐.
 * - Gemini·DeepSeek(웹): 서버에 해당 API 키가 있으면 어디서나 (배포 사이트 웹 데모).
 * - GPT(내 API 키): 원장님이 화면에 키를 넣으면 어디서나 (BYOK — 서버 키 불필요).
 */
export function localAgentsEnabled() {
  // STUDIO_LOOPBACK=1: scripts/studio.mjs 가 서버를 127.0.0.1 에만 열었다는 표시.
  // 요청 헤더(Host/Origin)는 위조할 수 있으므로, 외부에서 접근 가능한 주소로 띄운 서버에서는 ACP를 켜지 않는다.
  return process.env.STUDIO_ENABLED === "1" && process.env.STUDIO_LOOPBACK === "1" && !process.env.VERCEL;
}

export function availableAgents(): AgentDef[] {
  return [
    OPENAI_AGENT,
    ...(localAgentsEnabled() ? Object.values(ACP_AGENTS) : []),
    ...(geminiConfigured() ? [GEMINI_AGENT] : []),
    ...(deepseekConfigured() ? [DEEPSEEK_AGENT] : []),
  ];
}

export function studioEnabled() {
  return availableAgents().length > 0;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalHost(host: string | null) {
  if (!host) return false;
  return LOCAL_HOSTS.has(host.replace(/:\d+$/, ""));
}

/**
 * CSRF 방어: 다른 웹사이트가 방문자 브라우저를 통해 API를 호출하지 못하게 한다.
 * 1) Origin 이 요청 Host 와 같은 출처여야 함 (누락/null/교차 출처 거절)
 * 2) 커스텀 헤더 X-Studio-Request 필수 — 교차 출처에서는 CORS preflight 없이 보낼 수 없음
 * 3) local=true(ChatGPT·Claude: PC에서 프로그램 실행)면 localhost 의 http 출처만 허용
 */
export function isTrustedStudioRequest(headers: Headers, { local }: { local: boolean }) {
  const host = headers.get("host");
  const origin = headers.get("origin");
  if (!host || !origin || origin === "null") return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (o.host !== host) return false; // 포트까지 일치
  if (local) {
    if (!isLocalHost(host) || o.protocol !== "http:") return false;
  } else if (o.protocol !== "https:" && !isLocalHost(host)) {
    return false; // 배포 사이트는 https 만
  }
  if (headers.get("sec-fetch-site") && headers.get("sec-fetch-site") !== "same-origin") return false;
  return headers.get("x-studio-request") === "1";
}

/**
 * 웹 AI(Gemini·DeepSeek) 남용·비용 방지 (프로세스 메모리 기준, 1차 방어는 비밀번호 로그인)
 * - 접속 주소(IP)별 1시간 20건
 * - 전체 합계 1시간 60건: IP를 바꿔 가며 보내도 이 이상은 막힘
 * - 기록이 1,000개를 넘으면 오래된 기록부터 지우되, 한도에 걸린 주소의 기록은 지우지 않음
 * 한계: Vercel 인스턴스끼리 공유되지 않음 → 각 AI 콘솔의 월 사용 한도(지출 상한)도 함께 설정할 것.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_CLIENT = 20;
const MAX_TOTAL = 60;
const MAX_TRACKED = 1000;
const usage = new Map<string, number[]>();
let total: number[] = [];

function evictOne(now: number) {
  for (const [k, ts] of usage) {
    const recent = ts.filter((t) => now - t < WINDOW_MS);
    if (recent.length < MAX_PER_CLIENT) {
      usage.delete(k);
      return true;
    }
  }
  return false; // 전부 한도 상태 → 새 주소는 받지 않음
}

export function takeApiQuota(client: string) {
  const now = Date.now();
  total = total.filter((t) => now - t < WINDOW_MS);
  if (total.length >= MAX_TOTAL) return false;
  const recent = (usage.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_CLIENT) return false;
  if (!usage.has(client) && usage.size >= MAX_TRACKED && !evictOne(now)) return false;
  recent.push(now);
  usage.set(client, recent);
  total.push(now);
  return true;
}
