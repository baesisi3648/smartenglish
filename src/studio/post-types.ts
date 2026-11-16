/**
 * 블로그 글 유형별 입력 정의.
 * "사진+주제"만으로는 사실을 알 수 없으므로, 유형마다 필요한 사실을 원장이 직접 넣는다.
 * AI는 여기 없는 수치·발화·결과를 만들어내면 안 된다.
 */
export type Field = { key: string; label: string; required?: boolean; placeholder?: string; long?: boolean };

export type PostType = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  fields: Field[];
  defaultKeyword: string;
};

export const POST_TYPES: PostType[] = [
  {
    id: "exam",
    label: "시험 분석 · 성과",
    emoji: "📝",
    description: "학교별 시험 분석, 목표 달성 소식",
    defaultKeyword: "의왕 영어",
    fields: [
      { key: "school", label: "학교 · 학년", required: true, placeholder: "덕장중 3학년" },
      { key: "exam", label: "시험", required: true, placeholder: "2학기 중간고사" },
      { key: "analysis", label: "출제 경향 · 주요 문법", long: true, placeholder: "객관식 20 + 논술형 3 / 가정법 과거, enough to ..." },
      { key: "result", label: "확인된 결과 (없으면 비워두세요)", placeholder: "참여 학생 전원 목표 달성, 평균 40점 상승" },
    ],
  },
  {
    id: "growth",
    label: "학생 성장 스토리",
    emoji: "🌱",
    description: "수업 현장, 아이들의 변화",
    defaultKeyword: "초등 중등 영어",
    fields: [
      { key: "who", label: "대상 (실명 금지)", required: true, placeholder: "초등 3학년 친구들" },
      { key: "before", label: "처음 모습", placeholder: "숙제라면 고개부터 젓던 아이들" },
      { key: "after", label: "달라진 점", required: true, long: true, placeholder: "스스로 오답 확인, 100점 받아옴" },
      { key: "quote", label: "실제로 들은 말 (선택, 지어내지 않음)", placeholder: "\"선생님 저 100점이에요!\"" },
    ],
  },
  {
    id: "event",
    label: "모집 · 이벤트 공지",
    emoji: "📣",
    description: "무료체험, 방학특강, 신규반",
    defaultKeyword: "의왕 영어학원",
    fields: [
      { key: "name", label: "이벤트명", required: true, placeholder: "겨울방학 한 달 무료 체험" },
      { key: "period", label: "기간", required: true, placeholder: "12/22 ~ 1/31" },
      { key: "target", label: "대상 · 인원", required: true, placeholder: "초·중등, 선착순 7명" },
      { key: "benefit", label: "혜택 · 비용 · 조건", required: true, long: true, placeholder: "한 달 무료, 교재비 별도, 기존 원생 소개 할인" },
      { key: "hours", label: "운영 시간 (선택)", placeholder: "오전 10:00 ~ 오후 6:00" },
    ],
  },
  {
    id: "season",
    label: "시즌 행사 · 후기",
    emoji: "🎃",
    description: "할로윈, 추석 미션, 어린이날",
    defaultKeyword: "백운호수초",
    fields: [
      { key: "name", label: "행사명", required: true, placeholder: "할로윈 파티" },
      { key: "date", label: "날짜", placeholder: "10/31" },
      { key: "activity", label: "한 일", required: true, long: true, placeholder: "영어 미션 게임, 코스튬, 사탕 교환" },
    ],
  },
  {
    id: "column",
    label: "교육 정보 칼럼",
    emoji: "💡",
    description: "수능·내신·교육과정 정보",
    defaultKeyword: "의왕 영어학원",
    fields: [
      { key: "point", label: "전하고 싶은 핵심", required: true, long: true, placeholder: "수능 영어 절대평가지만 대학별 반영 방식이 달라 변수" },
      { key: "source", label: "근거 자료 출처 (권장)", placeholder: "OO대 입시요강, 교육부 보도자료 2026.10" },
    ],
  },
];

/** 키워드 후보 (기존 블로그 제목·태그에서 추출). 여러 개 선택 가능, 직접 추가도 가능 */
export const KEYWORD_GROUPS: { label: string; items: string[] }[] = [
  { label: "지역", items: ["의왕 영어", "의왕 영어학원", "의왕 영어교습소", "학의동 영어", "학의동 영어학원", "백운밸리 영어", "백운호수 영어"] },
  { label: "학교", items: ["백운호수초", "백운호수초등학교", "백운중", "덕장중"] },
  { label: "대상·과목", items: ["초등 영어", "중등 영어", "초등 중등 영어", "파닉스", "파닉스 리딩", "중등 내신", "영어 원서 읽기"] },
  { label: "시기", items: ["중간고사", "기말고사", "방학 특강", "무료 체험"] },
];

export const KEYWORD_OPTIONS = KEYWORD_GROUPS.flatMap((g) => g.items);
export const MAX_KEYWORDS = 12;

/** 사용자 입력 키워드 정리: 기호 제거, 20자 제한, 중복 제거, 최대 개수 */
export function sanitizeKeywords(raw: string[]) {
  const out: string[] = [];
  for (const k of raw) {
    const v = k.replace(/[[\]#<>{}"]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

export function getPostType(id: string) {
  return POST_TYPES.find((t) => t.id === id);
}
