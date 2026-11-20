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
