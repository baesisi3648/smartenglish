/**
 * 화면용: 초안·글 고치기 응답을 스트리밍(NDJSON)으로 받아 AI가 쓰는 대로 보여 준다.
 * 서버는 제목·본문을 풀어서(디코딩) 비밀값을 가린 뒤 항목별 조각으로 보내고, 마지막 줄에 기존 JSON 응답을 담는다.
 * 스트리밍이 아닌 응답(입력 오류 등 미리 거절된 요청)은 그냥 JSON으로 읽는다.
 */

export type LiveFields = { title: string; body: string };
type Field = keyof LiveFields;
type Line = { t: "d"; f: Field; v: string } | { t: "r"; f: Field; v: string } | { t: "end"; status: number; body: unknown };

export async function fetchStream(url: string, init: RequestInit, onText: (live: LiveFields) => void): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("X-Stream", "1");
  const res = await fetch(url, { ...init, headers });
  if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) return res.json();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const live: LiveFields = { title: "", body: "" };
  let end: unknown = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let msg: Line;
    try {
      msg = JSON.parse(line) as Line;
    } catch {
      return;
    }
    if (msg.t === "end") {
      end = msg.body;
      return;
    }
    if (msg.f !== "title" && msg.f !== "body") return;
    live[msg.f] = msg.t === "d" ? live[msg.f] + msg.v : msg.v;
    onText({ ...live });
  };
  try {
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
  } finally {
    await reader.cancel().catch(() => {}); // 오류·취소로 빠져나가도 연결 정리
  }
  if (end === null) throw new Error("응답이 중간에 끊겼습니다. 다시 시도해 주세요.");
  return end;
}
