/**
 * 화면용: 초안·글 고치기 응답을 스트리밍(NDJSON)으로 받아 AI가 쓰는 대로 보여 준다.
 * 서버는 AI 원문(JSON 형식으로 쓰는 중인 글)을 조각으로 보내고, 마지막 줄에 기존 JSON 응답을 담는다.
 * 스트리밍이 아닌 응답(입력 오류 등 미리 거절된 요청)은 그냥 JSON으로 읽는다.
 */

type Line = { t: "d"; v: string } | { t: "reset"; v: string } | { t: "end"; status: number; body: unknown };

export async function fetchStream(url: string, init: RequestInit, onText: (raw: string) => void): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("X-Stream", "1");
  const res = await fetch(url, { ...init, headers });
  if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) return res.json();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let raw = "";
  let end: unknown = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let msg: Line;
    try {
      msg = JSON.parse(line) as Line;
    } catch {
      return;
    }
    if (msg.t === "d") raw += msg.v;
    else if (msg.t === "reset") raw = msg.v;
    else if (msg.t === "end") end = msg.body;
    if (msg.t !== "end") onText(raw);
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  handle(buf + decoder.decode());
  if (end === null) throw new Error("응답이 중간에 끊겼습니다. 다시 시도해 주세요.");
  return end;
}

/**
 * 쓰는 중인 JSON 글에서 한 항목(title·body)의 지금까지 값을 꺼낸다.
 * 따옴표가 아직 안 닫혔으면 받은 데까지, 끝에 걸린 미완성 이스케이프(\, \u12)는 버린다.
 */
export function partialField(raw: string, field: "title" | "body"): string {
  const m = new RegExp(`"${field}"\\s*:\\s*"`).exec(raw);
  if (!m) return "";
  let out = "";
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') return out;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[i + 1];
    if (n === undefined) break;
    if (n === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ({ n: "\n", t: "\t", r: "", b: "", f: "" } as Record<string, string>)[n] ?? n;
    i += 1;
  }
  return out;
}
