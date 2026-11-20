import { BLOG_STYLE as S, DEFAULT_TEXT_STYLE, THANKS_FONT, fontStack, type FontId, type TextStyle } from "./blog-style";

/**
 * 초안 본문 서식 표시 → 화면 미리보기 / 네이버 에디터 붙여넣기용 HTML / 순수 텍스트.
 * 표시 규칙 (prompt.ts 의 formatGuide 와 같음):
 *   "## 소제목"  "> 인용"  "[사진N]"  "[그림: 장면 설명]"  줄 안의 "**핵심 키워드**"
 * 브라우저·서버 공용 (server-only 아님).
 */

/** 한 줄 안의 조각: 일반 글자 / 핵심 키워드(굵게+강조색) / 핵심 문장(굵게+밑줄) */
export type Span = { text: string; key?: boolean; under?: boolean };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "quote"; text: string; spans: Span[] }
  /** italic: 따옴표로 감싼 한 줄(아이·학부모의 말, 던지는 질문) — 원장님 글처럼 굵은 기울임 */
  | { kind: "text"; text: string; spans: Span[]; role?: "greeting-name" | "thanks" | "contact"; italic?: boolean }
  | { kind: "blank" }
  | { kind: "photo"; n: number }
  | { kind: "figure"; n: number; desc: string };

const PHOTO = /^\[사진\s*(\d+)\]$/;
const FIGURE = /^\[그림\s*[:：]\s*(.+?)\s*\]$/;

/**
 * 강조 한 쌍 (한 줄 안에서 표시 바로 안쪽이 공백이 아닌 구절):
 * **키워드** → 굵게+강조색, __핵심 문장__ → 굵게+밑줄 (원장님 글의 밑줄 강조)
 */
const PAIR = /\*\*(?=\S)([^*\n]*?\S)\*\*|__(?=\S)([^_\n]*?\S)__/g;
const UNDER_PAIR = /__(?=\S)([^_\n]*?\S)__/g;

/**
 * 강조 표시를 조각으로. 짝이 맞는 것만 강조로 쓰고,
 * 짝 없이 남은 ** 는 AI가 흘린 표시로 보고 지운다 (블로그 글에 별표 두 개를 그대로 쓸 일은 없음).
 */
export function parseInline(line: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(PAIR)) {
    const before = stripMarks(line.slice(last, m.index));
    if (before) out.push({ text: before });
    out.push(m[1] !== undefined ? { text: m[1], key: true } : { text: stripMarks(m[2]), under: true });
    last = m.index + m[0].length;
  }
  const rest = stripMarks(line.slice(last));
  if (rest || out.length === 0) out.push({ text: rest });
  return out;
}

function stripMarks(s: string) {
  return s.replace(UNDER_PAIR, "$1").replace(/\*\*/g, "");
}

/** 따옴표로 시작하고 끝나는 한 줄 (“…” 또는 "…") — 아이·학부모의 말, 던지는 질문 */
const QUOTED_LINE = /^[“"].*[”"]$/;

const THANKS = /^"\s*감사합니다\s*"$/;

/**
 * 시스템이 붙인 끝인사 블록의 시작 줄: 마지막 "감사합니다" 줄 중 뒤 6줄 안에 📞 연락처가 있는 것.
 * (본문 중간에 같은 문구가 있거나 원장님이 연락처를 지운 경우를 끝인사로 오인하지 않게)
 */
export function outroStart(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (THANKS.test(lines[i].trim()) && lines.slice(i + 1, i + 7).some((l) => l.trim().startsWith("📞"))) return i;
  }
  return -1;
}

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
  const outroFrom = outroStart(lines);
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
    const role = roleOf(line, i, outroFrom);
    const text = stripMarks(line);
    return { kind: "text", text, spans: parseInline(line), role, ...(!role && QUOTED_LINE.test(text) && text.length > 2 ? { italic: true } : {}) };
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
 * 글자 서식 (붙여넣기 후에도 유지되는 인라인 서식 — 에디터 기본 크기는 15px이라 크기를 글자마다 지정).
 * 바깥 div 의 color 는 에디터가 버릴 수 있어 글자마다 색을 단다 (원장님 글도 같은 방식).
 * 글씨체는 '기본서체'가 아니면 글자마다 font-family 를 단다.
 */
function inlineFmt(size: number, font: FontId) {
  const ff = fontStack(font, true);
  const css = (color: string, f = ff) => `color:${color};font-size:${size}px;${f ? `font-family:${f};` : ""}`;
  return {
    bold: (inner: string, color: string, f?: string | null) => `<span style="${css(color, f === undefined ? ff : f)}"><b>${inner}</b></span>`,
    tint: (inner: string, color: string, f?: string | null) => `<span style="${css(color, f === undefined ? ff : f)}">${inner}</span>`,
  };
}

/** 줄별 글씨체 이름(스마트에디터 클래스 se-ff-…): 기본서체는 원장님 글과 같은 빈 값 */
const seFont = (font: FontId) => (font === "default" ? "" : font);

/**
 * 가운데 정렬을 넣는 방식 (스마트에디터가 어느 것을 받는지 붙여넣기 시험 페이지로 확인):
 * - style: <p style="text-align:center">  (일반 웹 방식)
 * - attr:  <p align="center">  (옛 HTML 속성)
 * - se:    스마트에디터 자체 구조(se-text-paragraph-align-center 클래스) — 원장님 블로그 HTML과 같은 모양
 * - all:   위 세 가지를 한 번에
 */
export type AlignMode = "style" | "attr" | "se" | "all";
export const DEFAULT_ALIGN_MODE: AlignMode = "style";

/**
 * 네이버 스마트에디터에 붙여넣을 HTML. 줄마다 <p> 하나 (에디터가 문단 단위로 받음).
 * photos[n-1] / figures[n-1] 에 이미지 주소가 있으면 그 자리에 넣고, 없으면 [사진N]·[그림N] 글자를 남긴다.
 * 글자 서식은 원장님 블로그 실제 값(blog-style.ts): 16px, 본문 회색, 소제목 초록 굵게, 핵심 키워드 주황 굵게.
 */
export function toEditorHtml(
  body: string,
  {
    photos,
    figures,
    center,
    align: mode = DEFAULT_ALIGN_MODE,
    allowHttpsImages = false,
    style = DEFAULT_TEXT_STYLE,
  }: {
    photos: (string | undefined)[];
    figures: (string | undefined)[];
    center: boolean;
    align?: AlignMode;
    /** 붙여넣기 시험용: https 이미지 주소도 허용 */
    allowHttpsImages?: boolean;
    /** 글씨 크기·글씨체·끝인사 손글씨 */
    style?: TextStyle;
  },
): string {
  const size = style.fontSize;
  const { bold, tint } = inlineFmt(size, style.font);
  // 기울임·밑줄은 태그와 인라인 스타일을 함께 (에디터가 어느 쪽을 받든 남도록)
  const it = (s: string) => `<i style="font-style:italic;">${s}</i>`;
  const ul = (s: string) => `<u style="text-decoration:underline;">${s}</u>`;
  const spansHtml = (spans: Span[], baseColor: string, baseBold: boolean, italic = false) =>
    spans
      .map((s) => {
        const t = italic ? it(esc(s.text)) : esc(s.text);
        if (s.key) return bold(t, S.keywordColor);
        if (s.under) return bold(ul(t), S.strongColor);
        return baseBold ? bold(t, baseColor) : tint(t, baseColor);
      })
      .join("");
  const useStyle = center && (mode === "style" || mode === "all");
  const useAttr = center && (mode === "attr" || mode === "all");
  const useSe = mode === "se" || mode === "all";
  const pClass = useSe ? ` class="se-text-paragraph se-text-paragraph-align-${center ? "center" : "left"}"` : "";
  const p = (inner: string, font: FontId = style.font) =>
    `<p${pClass}${useAttr ? ' align="center"' : ""}${useStyle ? ' style="text-align:center;"' : ""}>${
      useSe ? `<span class="se-fs-fs${size} se-ff-${seFont(font)}">${inner}</span>` : inner
    }</p>`;
  // 이미지는 이 화면이 만든 data URL(JPEG/PNG/WebP base64)만 넣는다 (시험 페이지는 https 주소도)
  const safe = (src: string | undefined) =>
    src && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) || (allowHttpsImages && /^https:\/\/[^\s"'<>]+$/.test(src)))
      ? src
      : undefined;
  const img = (src: string) => p(`<img src="${esc(src)}" style="max-width:100%;" width="740" alt="">`);
  const html = parseBody(body)
    .map((b) => {
      switch (b.kind) {
        case "blank":
          return p("<br>");
        case "heading":
          return p(bold(esc(b.text), S.headingColor));
        case "quote":
          return p(spansHtml(b.spans, S.strongColor, true, true)); // 원장님 글: 인용은 굵은 기울임
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
          // 끝인사 "감사합니다": 원장님처럼 손글씨체(다시시작해)
          if (b.role === "thanks" && style.thanksHand) return p(bold(esc(b.text), S.strongColor, fontStack(THANKS_FONT, true)), THANKS_FONT);
          if (b.role) return p(bold(esc(b.text), S.strongColor));
          // 따옴표로 감싼 한 줄(아이·학부모의 말, 질문): 굵은 기울임
          return p(b.italic ? spansHtml(b.spans, S.bodyColor, true, true) : spansHtml(b.spans, S.bodyColor, false));
      }
    })
    .join("");
  const wrapped = useSe
    ? `<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text">${html}</div></div></div></div>`
    : html;
  const ff = fontStack(style.font, true);
  return `<div style="font-size:${size}px;line-height:${S.lineHeight};color:${S.bodyColor};${ff ? `font-family:${ff};` : ""}">${wrapped}</div>`;
}

/**
 * 글 고치기 전후 비교: 새 본문에서 바뀌었거나 새로 생긴 줄 번호 (줄 단위 LCS).
 * 빈 줄은 표시하지 않는다. 본문이 수백 줄을 넘지 않아 O(n·m)으로 충분하다.
 */
export function changedLines(before: string, after: string): Set<number> {
  const a = before.split("\n").map((l) => l.trim());
  const b = after.split("\n").map((l) => l.trim());
  // 아주 긴 글은 표가 커지므로(메모리·시간) "예전 글에 없던 줄"만 표시하는 간단한 방식
  if (a.length * b.length > 200_000) {
    const old = new Set(a);
    return new Set(b.flatMap((l, j) => (l && !old.has(l) ? [j] : [])));
  }
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const same = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      same.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = new Set<number>();
  b.forEach((l, j) => {
    if (l && !same.has(j)) out.add(j);
  });
  return out;
}
