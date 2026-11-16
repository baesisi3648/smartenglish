import "server-only";

/**
 * 스튜디오는 원장 PC에서만 동작한다.
 * - `npm run studio` 가 STUDIO_ENABLED=1 을 설정한다.
 * - Vercel 등 배포 환경에서는 env가 없으므로 항상 꺼짐.
 */
export function studioEnabled() {
  return process.env.STUDIO_ENABLED === "1" && !process.env.VERCEL;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalHost(host: string | null) {
  if (!host) return false;
  return LOCAL_HOSTS.has(host.replace(/:\d+$/, ""));
}

/**
 * 로컬 CSRF 방어: 다른 웹사이트가 브라우저를 통해 localhost API를 호출하지 못하게 한다.
 * 1) Origin 이 같은 localhost 출처여야 함 (누락/null/교차 출처 거절)
 * 2) 커스텀 헤더 X-Studio-Request 필수 — 교차 출처에서는 CORS preflight 없이 보낼 수 없음
 */
export function isTrustedStudioRequest(headers: Headers) {
  const host = headers.get("host");
  const origin = headers.get("origin");
  if (!isLocalHost(host) || !origin || origin === "null") return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (o.protocol !== "http:" || !LOCAL_HOSTS.has(o.hostname === "::1" ? "[::1]" : o.hostname)) return false;
  if (o.host !== host) return false; // 포트까지 일치
  if (headers.get("sec-fetch-site") && headers.get("sec-fetch-site") !== "same-origin") return false;
  return headers.get("x-studio-request") === "1";
}
