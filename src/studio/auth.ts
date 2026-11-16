import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * 관리자 비밀번호 인증 (스튜디오 전용).
 * - 비밀번호는 환경변수 STUDIO_PASSWORD (로컬: web/.env.local, 배포: Vercel 환경변수)
 * - 세션은 서명된 httpOnly 쿠키. 비밀번호를 바꾸면 기존 세션은 모두 무효.
 */
export const SESSION_COOKIE = "hb_studio";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12시간

export function passwordConfigured() {
  return (process.env.STUDIO_PASSWORD ?? "").length >= 8;
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
 * 무차별 대입 방지: 접속 주소(IP)별로 연속 5회 실패 시 1분 잠금.
 * 다른 방문자의 실패가 원장님을 잠그지 않도록 IP 단위로 분리한다.
 * 한계: 프로세스 메모리 기준이라 Vercel 인스턴스 간에는 공유되지 않음
 * (배포본은 안내 화면만 보호하고, 실제 생성 API는 로컬 전용이라 영향이 제한적).
 */
const attempts = new Map<string, { fails: number; lockedUntil: number }>();
const MAX_TRACKED = 1000;

export function loginLocked(client: string) {
  const a = attempts.get(client);
  return !!a && Date.now() < a.lockedUntil;
}

export function recordLogin(client: string, ok: boolean) {
  if (ok) {
    attempts.delete(client);
    return;
  }
  if (!attempts.has(client) && attempts.size >= MAX_TRACKED) {
    attempts.delete(attempts.keys().next().value!); // 가장 오래된 항목 제거
  }
  const a = attempts.get(client) ?? { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= 5) {
    a.fails = 0;
    a.lockedUntil = Date.now() + 60_000;
  }
  attempts.set(client, a);
}
