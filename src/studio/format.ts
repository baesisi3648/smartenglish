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

/** 강조 한 쌍: 한 줄 안에서 ** 바로 안쪽이 공백이 아닌 구절 */
const PAIR = /\*\*(?=\S)([^*\n]*?\S)\*\*/g;

/**
 * "**키워드**" 표시를 조각으로. 짝이 맞는 것만 강조로 쓰고,
 * 짝 없이 남은 ** 는 AI가 흘린 표시로 보고 지운다 (블로그 글에 별표 두 개를 그대로 쓸 일은 없음).
 */
export function parseInline(line: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(PAIR)) {
    const before = stripMarks(line.slice(last, m.index));
    if (before) out.push({ text: before });
    out.push({ text: m[1], key: true });
    last = m.index + m[0].length;
  }
  const rest = stripMarks(line.slice(last));
  if (rest || out.length === 0) out.push({ text: rest });
  return out;
}

function stripMarks(s: string) {
  return s.replace(/\*\*/g, "");
}

const THANKS = /^"\s*감사합니다\s*"$/;

/**
 * 인사말·끝인사·연락처 줄 (template.ts 가 붙이는 고정 문구) — 블로그처럼 굵게.
 * 본문 중간의 비슷한 줄(📍 학습 포인트 등)은 건드리지 않도록 위치로 판단한다:
 * 교습소 이름은 맨 앞 두 줄 안, 연락처는 마지막 "감사합니다" 뒤에서만.
 */
function roleOf(line: string, i: number, outroFrom: number): "greeting-name" | "thanks" | "contact" | undefined {
  if (i <= 1 && /^스마트해법영어 백운밸리점입니다/.test(line)) return "greeting-name";
  if (i === outroFrom) return "thanks";
  if (outroFrom >= 0 && i > outroFrom && /^(📞|📍)|^0\d{1,2}-\d{3,4}-\d{4}$/.test(line)) return "contact";
  return undefined;
}

/** 단독 줄 자리 표시를 강조로 감싸도(**[사진1]**) 자리 표시로 본다 */
const unwrap = (line: string) => line.replace(/^\*\*\s*(\[[^\]]+\])\s*\*\*$/, "$1");

export function parseBody(body: string): Block[] {
  let fig = 0;
  const lines = body.split("\n");
  const outroFrom = lines.findLastIndex((l) => THANKS.test(l.trim()));
  return lines.map((raw, i): Block => {
    const line = unwrap(raw.trim());
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
    return { kind: "text", text: stripMarks(line), spans: parseInline(line), role: roleOf(line, i, outroFrom) };
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

/** 글자 색·굵기·크기 (붙여넣기 후에도 유지되는 인라인 서식 — 에디터 기본 크기는 15px이라 16px을 글자마다 지정) */
const bold = (inner: string, color: string) => `<span style="color:${color};font-size:${S.fontSize}px;"><b>${inner}</b></span>`;

/** 색만 입힌 글자 — 바깥 div 의 color 는 에디터가 버릴 수 있어 글자마다 색을 단다 (원장님 글도 같은 방식) */
const tint = (inner: string, color: string) => `<span style="color:${color};font-size:${S.fontSize}px;">${inner}</span>`;

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
  // 이미지는 이 화면이 만든 data URL(JPEG/PNG/WebP base64)만 넣는다
  const safe = (src: string | undefined) => (src && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : undefined);
  const img = (src: string) => p(`<img src="${esc(src)}" style="max-width:100%;" width="740" alt="">`);
  const html = parseBody(body)
    .map((b) => {
      switch (b.kind) {
        case "blank":
          return p("<br>");
        case "heading":
          return p(bold(esc(b.text), S.headingColor));
        case "quote":
          return p(spansHtml(b.spans, S.strongColor, true));
        case "photo": {
          const src = safe(photos[b.n - 1]);
          return src ? img(src) : p(tint(`[사진${b.n}]`, S.bodyColor));
        }
        case "figure": {
          const src = safe(figures[b.n - 1]);
          return src ? img(src) : p(tint(`[그림${b.n}]`, S.bodyColor));
        }
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
