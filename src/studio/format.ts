/**
 * 초안 본문 서식 표시 → 화면 미리보기 / 네이버 에디터 붙여넣기용 HTML / 순수 텍스트.
 * 표시 규칙 (prompt.ts 의 formatGuide 와 같음):
 *   "## 소제목"  "> 인용"  "[사진N]"  "[그림: 장면 설명]"
 * 브라우저·서버 공용 (server-only 아님).
 */

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" }
  | { kind: "photo"; n: number }
  | { kind: "figure"; n: number; desc: string };

const PHOTO = /^\[사진\s*(\d+)\]$/;
const FIGURE = /^\[그림\s*[:：]\s*(.+?)\s*\]$/;

export function parseBody(body: string): Block[] {
  let fig = 0;
  return body.split("\n").map((raw): Block => {
    const line = raw.trim();
    if (!line) return { kind: "blank" };
    const p = line.match(PHOTO);
    if (p) return { kind: "photo", n: Number(p[1]) };
    const f = line.match(FIGURE);
    if (f) return { kind: "figure", n: ++fig, desc: f[1] };
    if (/^#{1,3}\s+/.test(line)) return { kind: "heading", text: line.replace(/^#{1,3}\s+/, "") };
    if (/^>\s?/.test(line)) return { kind: "quote", text: line.replace(/^>\s?/, "") };
    return { kind: "text", text: line };
  });
}

/** 본문의 [그림: …] 설명 목록 (순서 = 그림 번호) */
export function figuresOf(body: string): string[] {
  return parseBody(body).flatMap((b) => (b.kind === "figure" ? [b.desc] : []));
}

/** 서식 표시를 뺀 순수 텍스트 (그림 자리는 [그림N]으로 남겨 직접 올릴 위치를 알려 줌) */
export function toPlainText(body: string): string {
  return parseBody(body)
    .map((b) => {
      switch (b.kind) {
        case "blank":
          return "";
        case "photo":
          return `[사진${b.n}]`;
        case "figure":
          return `[그림${b.n}]`;
        default:
          return b.text;
      }
    })
    .join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 네이버 스마트에디터에 붙여넣을 HTML. 줄마다 <p> 하나 (에디터가 문단 단위로 받음).
 * photos[n-1] / figures[n-1] 에 data URL 이 있으면 그 자리에 이미지를 넣고, 없으면 [사진N]·[그림N] 글자를 남긴다.
 */
export function toEditorHtml(
  body: string,
  { photos, figures, center }: { photos: (string | undefined)[]; figures: (string | undefined)[]; center: boolean },
): string {
  const align = center ? "text-align:center;" : "";
  const p = (inner: string) => `<p style="${align}">${inner}</p>`;
  const img = (src: string) => p(`<img src="${src}" style="max-width:100%;" width="740" alt="">`);
  const html = parseBody(body)
    .map((b) => {
      switch (b.kind) {
        case "blank":
          return p("<br>");
        case "heading":
          return p(`<span style="font-size:19px;color:#00317a;"><b>${esc(b.text)}</b></span>`);
        case "quote":
          return p(`<span style="color:#555555;">${esc(b.text)}</span>`);
        case "photo":
          return photos[b.n - 1] ? img(photos[b.n - 1]!) : p(`[사진${b.n}]`);
        case "figure":
          return figures[b.n - 1] ? img(figures[b.n - 1]!) : p(`[그림${b.n}]`);
        default:
          return p(esc(b.text));
      }
    })
    .join("");
  return `<div style="font-size:16px;line-height:1.8;">${html}</div>`;
}
