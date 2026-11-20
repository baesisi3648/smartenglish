/**
 * 원장님 블로그(sukjoon331) 실제 서식 — 2026-11-20 최근 글 8편의 스마트에디터 HTML을 분석한 값.
 * (분석 메모: 프로젝트 폴더 docs/blog-style-analysis.md — 이 저장소 밖)
 * 미리보기와 "네이버 에디터용 복사"가 같은 값을 쓴다. 브라우저·서버 공용.
 */
export const BLOG_STYLE = {
  /** 본문: 전 문단 가운데 정렬, 16px(se-fs16), 회색 글자 */
  fontSize: 16,
  lineHeight: 1.8,
  bodyColor: "#666666",
  /** 굵은 질문·강조 줄 (색 없이 굵게만 쓸 때) */
  strongColor: "#333333",
  /** 번호 소제목: 본문과 같은 크기, 굵게 + 초록 (최근 글에서 가장 많이 쓴 소제목 색) */
  headingColor: "#54b800",
  /** 본문 속 핵심 키워드: 굵게 + 주황 (원장님이 강조할 때 가장 많이 쓴 색) */
  keywordColor: "#ff9300",
  /** 인사말 속 교습소 이름: 굵게 + 하늘색 */
  nameColor: "#00b3f2",
  /** 줄 길이: 실제 글 중앙값 19자, 90%가 29자 이하 */
  lineChars: { median: 19, max: 29 },
} as const;

/**
 * 네이버 스마트에디터 글씨체 목록 (에디터 화면 CSS se.viewer 1.78 의 se-ff-* 클래스와 같은 이름).
 * 글꼴 파일은 네이버 에디터가 쓰는 주소(editor-static.pstatic.net, CORS 허용)를 미리보기에서도 그대로 쓴다.
 * - default: 원장님 글처럼 따로 지정하지 않음 (블로그 기본서체)
 * - 원장님은 끝인사 "감사합니다" 줄에만 손글씨체 '다시시작해'를 쓴다 (최근 글 8편 중 6편)
 */
export const NAVER_FONTS = [
  { id: "default", label: "기본서체 (원장님 글)", names: [], generic: "sans-serif", bold: 700 },
  { id: "nanumgothic", label: "나눔고딕", names: ["나눔고딕", "NanumGothic"], generic: "sans-serif", bold: 700 },
  { id: "nanummyeongjo", label: "나눔명조", names: ["나눔명조", "NanumMyeongjo"], generic: "serif", bold: 700 },
  { id: "nanumbarungothic", label: "나눔바른고딕", names: ["나눔바른고딕", "NanumBarunGothic"], generic: "sans-serif", bold: 700 },
  { id: "nanumsquare", label: "나눔스퀘어", names: ["나눔스퀘어", "NanumSquare"], generic: "sans-serif", bold: 700 },
  { id: "nanummaruburi", label: "마루부리", names: ["마루부리", "MaruBuri"], generic: "serif", bold: 700 },
  { id: "pretendard", label: "프리텐다드", names: ["Pretendard"], generic: "sans-serif", bold: 600 },
  { id: "nanumdasisijaghae", label: "다시시작해 (손글씨)", names: ["다시시작해"], generic: "cursive", bold: 0 },
  { id: "nanumbareunhipi", label: "바른히피 (손글씨)", names: ["바른히피"], generic: "cursive", bold: 0 },
  { id: "nanumuriddalsongeulssi", label: "우리딸손글씨 (손글씨)", names: ["우리딸손글씨"], generic: "cursive", bold: 0 },
] as const;
export type FontId = (typeof NAVER_FONTS)[number]["id"];

/** 네이버 에디터 글씨 크기 메뉴에 있는 값 중 본문에 쓸 만한 것 (se-fs-fsN) */
export const NAVER_SIZES = [
  { px: 13, label: "13 (작게)" },
  { px: 15, label: "15 (네이버 기본)" },
  { px: 16, label: "16 (원장님 글)" },
  { px: 19, label: "19 (크게)" },
  { px: 24, label: "24 (아주 크게)" },
] as const;

/** 본문 글씨 설정: 크기·글씨체·끝인사 손글씨 */
export type TextStyle = { fontSize: number; font: FontId; thanksHand: boolean };
export const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: BLOG_STYLE.fontSize, font: "default", thanksHand: true };
/** 끝인사 "감사합니다" 줄 손글씨체 (원장님 글과 같음) */
export const THANKS_FONT: FontId = "nanumdasisijaghae";

const SYSTEM_STACK = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const fontOf = (id: string) => NAVER_FONTS.find((f) => f.id === id);

/** 알 수 없는 값(옛 저장값 등)을 안전한 설정으로 */
export function normalizeTextStyle(v: unknown): TextStyle {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof TextStyle, unknown>>;
  const size = NAVER_SIZES.find((s) => s.px === o.fontSize)?.px ?? DEFAULT_TEXT_STYLE.fontSize;
  const font = fontOf(String(o.font))?.id ?? DEFAULT_TEXT_STYLE.font;
  return { fontSize: size, font, thanksHand: typeof o.thanksHand === "boolean" ? o.thanksHand : DEFAULT_TEXT_STYLE.thanksHand };
}

/**
 * 글씨체 CSS 값. 붙여넣기용(paste)은 네이버 글꼴 이름(se-…)과 한글·영문 이름을 함께 넣어
 * 에디터가 어느 이름으로든 알아보게 한다. default 는 지정 안 함(null).
 */
export function fontStack(id: FontId, forPaste = false): string | null {
  const f = fontOf(id);
  if (!f || f.id === "default") return forPaste ? null : SYSTEM_STACK;
  return [`se-${f.id}`, ...f.names, f.generic].join(", ");
}

/** 미리보기용 @font-face (네이버 에디터와 같은 글꼴 파일) */
export function fontFaceCss(ids: FontId[]): string {
  const base = "https://editor-static.pstatic.net/c/resources/common/fonts";
  return [...new Set(ids)]
    .flatMap((id) => {
      const f = fontOf(id);
      if (!f || f.id === "default") return [];
      const face = (weight: number, file: string) =>
        `@font-face{font-family:se-${f.id};font-weight:${weight};font-display:swap;src:url("${base}/se-${f.id}-${file}.woff2") format("woff2"),url("${base}/se-${f.id}-${file}.woff") format("woff")}`;
      return [face(400, "regular"), ...(f.bold ? [face(f.bold, f.bold === 600 ? "semibold" : "bold")] : [])];
    })
    .join("\n");
}
