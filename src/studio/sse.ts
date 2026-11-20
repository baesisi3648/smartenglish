import "server-only";

/** 스트리밍 응답에서 받은 글 조각을 화면으로 넘기는 콜백 (AI가 쓰는 대로 보여 주기) */
export type OnDelta = (text: string) => void;

/**
 * Server-Sent Events 본문을 읽어 `data:` 값을 하나씩 돌려준다 (OpenAI·Gemini·DeepSeek 공통).
 * 한 이벤트가 여러 `data:` 줄이면 줄바꿈으로 잇는다. `[DONE]` 은 호출한 쪽에서 처리.
 */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line === "") {
          if (data.length) yield data.join("\n");
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
    }
    buf += decoder.decode();
    if (buf.startsWith("data:")) data.push(buf.slice(5).replace(/^ /, ""));
    if (data.length) yield data.join("\n");
  } finally {
    // 중간에 멈춰도(오류·취소) 연결을 닫는다. 다 읽은 뒤에는 아무 일도 하지 않음
    await reader.cancel().catch(() => {});
  }
}

/** JSON 한 조각 파싱 (깨진 조각은 건너뜀) */
export function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
