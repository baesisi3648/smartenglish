import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * 관리자 비밀번호 인증 (스튜디오 전용).
 * - 비밀번호는 환경변수 STUDIO_PASSWORD (로컬: web/.env.local, 배포: Vercel 환경변수)
 * - 세션은 STUDIO_SECRET(32자 이상 무작위 서명키)으로 서명한 httpOnly 쿠키.
 *   서명키가 비밀번호와 독립이라, 쿠키를 손에 넣어도 비밀번호를 오프라인으로 추측할 수 없다.
 * - 비밀번호나 서명키를 바꾸면 기존 세션은 모두 무효 (로그아웃은 이 브라우저의 쿠키만 지움).
 */
export const SESSION_COOKIE = "hb_studio";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12시간

export function passwordConfigured() {
  return (process.env.STUDIO_PASSWORD ?? "").length >= 8 && (process.env.STUDIO_SECRET ?? "").length >= 32;
}

function key() {
  return createHash("sha256")
    .update(`hb-studio:${process.env.STUDIO_PASSWORD ?? ""}:${process.env.STUDIO_SECRET ?? ""}`)
    .digest();
}

function sign(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function createSessionToken() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${exp}.${sign(String(exp))}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token || !passwordConfigured()) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) * 1000 < Date.now()) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(input: string) {
  if (!passwordConfigured()) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(process.env.STUDIO_PASSWORD!).digest();
  return timingSafeEqual(a, b);
}

/**
 * 무차별 대입 방지 (프로세스 메모리 기준):
 * - 접속 주소(IP)별 연속 5회 실패 시 1분 잠금 — 다른 방문자의 실패가 원장님을 잠그지 않도록 IP 단위
 * - 전체 합계 10분에 30회 실패 시 5분간 모든 로그인 잠금 — IP를 바꿔 가며 대입하는 경우 대비
 * - 기록이 1,000개를 넘으면 오래된 기록부터 지우되, 잠긴 주소의 기록은 지우지 않음
 * 한계: Vercel 인스턴스끼리 공유되지 않음 → 비밀번호는 충분히 길게(12자 이상 무작위) 쓸 것.
 */
const attempts = new Map<string, { fails: number; lockedUntil: number }>();
const MAX_TRACKED = 1000;
const GLOBAL_WINDOW_MS = 10 * 60_000;
const GLOBAL_MAX_FAILS = 30;
let globalFails: number[] = [];
let globalLockedUntil = 0;

export function loginLocked(client: string) {
  const now = Date.now();
  if (now < globalLockedUntil) return true;
  const a = attempts.get(client);
  return !!a && now < a.lockedUntil;
}

export function recordLogin(client: string, ok: boolean) {
  if (ok) {
    attempts.delete(client);
    return;
  }
  const now = Date.now();
  globalFails = globalFails.filter((t) => now - t < GLOBAL_WINDOW_MS);
  globalFails.push(now);
  if (globalFails.length >= GLOBAL_MAX_FAILS) {
    globalLockedUntil = now + 5 * 60_000;
    globalFails = [];
  }
  if (!attempts.has(client) && attempts.size >= MAX_TRACKED) {
    // 잠기지 않은 가장 오래된 항목 제거 (잠긴 주소는 유지). 전부 잠겨 있으면 새 주소 기록 생략
    const victim = [...attempts].find(([, v]) => now >= v.lockedUntil)?.[0];
    if (!victim) return;
    attempts.delete(victim);
  }
  const a = attempts.get(client) ?? { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= 5) {
    a.fails = 0;
    a.lockedUntil = Date.now() + 60_000;
  }
  attempts.set(client, a);
}
