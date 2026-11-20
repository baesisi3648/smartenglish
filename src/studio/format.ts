import { BLOG_STYLE as S } from "./blog-style";

/**
 * 초안 본문 서식 표시 → 화면 미리보기 / 네이버 에디터 붙여넣기용 HTML / 순수 텍스트.
 * 표시 규칙 (prompt.ts 의 formatGuide 와 같음):
 *   "## 소제목"  "> 인용"  "[사진N]"  "[그림: 장면 설명]"  줄 안의 "**핵심 키워드**"
 * 브라우저·서버 공용 (server-only 아님).
 */

/** 한 줄 안의 조각: 일반 글자 / 핵심 키워드(굵게+강조색) */
export type Span = { text: string; key?: boolean };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "quote"; text: string; spans: Span[] }
  | { kind: "text"; text: string; spans: Span[]; role?: "greeting-name" | "thanks" | "contact" }
  | { kind: "blank" }
  | { kind: "photo"; n: number }
  | { kind: "figure"; n: number; desc: string };

const PHOTO = /^\[사진\s*(\d+)\]$/;
const FIGURE = /^\[그림\s*[:：]\s*(.+?)\s*\]$/;

/** "**키워드**" 표시를 조각으로. 짝이 안 맞는 ** 는 글자에서 지운다 */
export function parseInline(line: string): Span[] {
  const parts = line.split("**");
  if (parts.length < 3) return [{ text: line.replace(/\*\*/g, "") }];
  const out: Span[] = [];
  parts.forEach((p, i) => {
    if (!p) return;
    // 홀수 번째 조각 = ** 사이. 마지막 조각이 홀수면 닫는 ** 가 없는 것 → 일반 글자
    const key = i % 2 === 1 && i < parts.length - 1;
    out.push(key && p.trim() ? { text: p, key: true } : { text: p });
  });
  return out;
}

const stripMarks = (s: string) => s.replace(/\*\*/g, "");

/** 인사말·끝인사·연락처 줄 (template.ts 가 붙이는 고정 문구) — 블로그처럼 굵게 */
function roleOf(line: string): "greeting-name" | "thanks" | "contact" | undefined {
  if (/^스마트해법영어 백운밸리점입니다/.test(line)) return "greeting-name";
  if (/^"\s*감사합니다\s*"$/.test(line)) return "thanks";
  if (/^(📞|📍)|^0\d{1,2}-\d{3,4}-\d{4}$/.test(line)) return "contact";
  return undefined;
}

export function parseBody(body: string): Block[] {
  let fig = 0;
  return body.split("\n").map((raw): Block => {
    const line = raw.trim();
    if (!line) return { kind: "blank" };
    const p = line.match(PHOTO);
    if (p) return { kind: "photo", n: Number(p[1]) };
    const f = line.match(FIGURE);
    if (f) return { kind: "figure", n: ++fig, desc: f[1] };
    if (/^#{1,3}\s+/.test(line)) return { kind: "heading", text: stripMarks(line.replace(/^#{1,3}\s+/, "")) };
    if (/^>\s?/.test(line)) {
      const text = line.replace(/^>\s?/, "");
      return { kind: "quote", text: stripMarks(text), spans: parseInline(text) };
    }
    return { kind: "text", text: stripMarks(line), spans: parseInline(line), role: roleOf(line) };
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

/** 글자 색·굵기 (붙여넣기 후에도 유지되는 인라인 서식) */
const bold = (inner: string, color: string) => `<span style="color:${color};"><b>${inner}</b></span>`;

/** 색만 입힌 글자 — 바깥 div 의 color 는 에디터가 버릴 수 있어 글자마다 색을 단다 (원장님 글도 같은 방식) */
const tint = (inner: string, color: string) => `<span style="color:${color};">${inner}</span>`;

function spansHtml(spans: Span[], baseColor: string, baseBold: boolean) {
  return spans
    .map((s) =>
      s.key ? bold(esc(s.text), S.keywordColor) : baseBold ? bold(esc(s.text), baseColor) : tint(esc(s.text), baseColor),
    )
    .join("");
}

/**
 * 네이버 스마트에디터에 붙여넣을 HTML. 줄마다 <p> 하나 (에디터가 문단 단위로 받음).
 * photos[n-1] / figures[n-1] 에 data URL 이 있으면 그 자리에 이미지를 넣고, 없으면 [사진N]·[그림N] 글자를 남긴다.
 * 글자 서식은 원장님 블로그 실제 값(blog-style.ts): 16px, 본문 회색, 소제목 초록 굵게, 핵심 키워드 주황 굵게.
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
          return p(bold(esc(b.text), S.headingColor));
        case "quote":
          return p(spansHtml(b.spans, S.strongColor, true));
        case "photo":
          return photos[b.n - 1] ? img(photos[b.n - 1]!) : p(`[사진${b.n}]`);
        case "figure":
          return figures[b.n - 1] ? img(figures[b.n - 1]!) : p(`[그림${b.n}]`);
        default:
          if (b.role === "greeting-name") {
            return p(`${bold("스마트해법영어 백운밸리점", S.nameColor)}${tint(esc(b.text.replace(/^스마트해법영어 백운밸리점/, "")), S.bodyColor)}`);
          }
          if (b.role) return p(bold(esc(b.text), S.strongColor));
          return p(spansHtml(b.spans, S.bodyColor, false));
      }
    })
    .join("");
  return `<div style="font-size:${S.fontSize}px;line-height:${S.lineHeight};color:${S.bodyColor};">${html}</div>`;
}
