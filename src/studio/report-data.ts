import "server-only";

/**
 * 블로그 분석 리포트 — 실제 데이터 (2026-11-23 원장님 계정에서 받은 값).
 * 출처: 네이버 블로그 관리 > 내 블로그 통계 (엑셀 다운로드·캡처), 네이버 검색광고 > 키워드 도구.
 * 네이버 블로그 통계는 API가 없어 자동으로 갱신되지 않는다. 새 엑셀을 받으면 이 파일의 숫자만 바꾸면 된다.
 */

export type DailyPoint = { date: string; label: string; views: number; post?: string };
export type Share = { label: string; value: number };
export type MonthPoint = { label: string; views: number; visitors?: number; visitorsApprox?: boolean; /** 진행 중인 달: 이 날짜까지 합계 */ untilDay?: number };

export const UPDATED = "2026.11.23";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 일별 조회수 2026-08-25 ~ 2026-11-22 (90일). 이웃 조회는 90일 동안 1회뿐이라 합계만 둔다. */
const DAILY_FROM = Date.UTC(2026, 7, 25);
const DAILY_VIEWS = [
  1, 3, 1, 3, 2, 1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 27, 1, 0, 0, 0, 5, 0, 2, 6, 2, 0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 1, 3, 1,
  0, 1, 4, 0, 0, 0, 4, 6, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 3, 1, 1, 1, 11, 10, 32, 7, 2, 2, 2, 6, 18, 3, 1, 0, 0, 0,
  10, 5, 5, 1, 2, 3, 1,
];
export const NEIGHBOR_VIEWS_90D = 1;

/** 일별 자료의 마지막 날 (월별 진행 중 합계·화면 기간 표시를 모두 여기서 계산) */
const LAST = new Date(DAILY_FROM + (DAILY_VIEWS.length - 1) * 86_400_000);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "26.11" → "11월" */
export const monthName = (label: string) => `${Number(label.slice(3))}월`;
/** 일별 자료 끝에서 weeksAgo 주 전의 7일 범위 → "11.16 ~ 11.22" */
export function weekRange(weeksAgo = 0) {
  const end = new Date(LAST.getTime() - weeksAgo * 7 * 86_400_000);
  const start = new Date(end.getTime() - 6 * 86_400_000);
  const f = (d: Date) => `${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`;
  return `${f(start)} ~ ${f(end)}`;
}

/** 이 기간에 올린 글 (RSS 기준) */
export const POSTS_IN_RANGE: { date: string; title: string; link: string }[] = [
  { date: "2026-10-02", title: "중등 중간고사 목표 달성까지![의왕 영어]", link: "https://blog.naver.com/sukjoon331/224429310037" },
  { date: "2026-10-02", title: "영어가 재미있어지는 순간, 아이들의 태도가 바뀝니다[의왕 영어]", link: "https://blog.naver.com/sukjoon331/224429390020" },
  { date: "2026-10-16", title: "반복학습의 결과, 두번째 최고의 학생 등장[초등 중등 영어]", link: "https://blog.naver.com/sukjoon331/224443663844" },
  { date: "2026-10-27", title: "할로윈이 무엇인지 아시나요[의왕 영어]", link: "https://blog.naver.com/sukjoon331/224455533280" },
  { date: "2026-11-05", title: "11월부터 준비하는 겨울방학 영어공부, 지금 점검해야 할 것들 [백운호수초]", link: "https://blog.naver.com/sukjoon331/224466038564" },
  { date: "2026-11-07", title: "덕장중 2학기 중간고사 분석 [덕장중 3학년]", link: "https://blog.naver.com/sukjoon331/224468199736" },
  { date: "2026-11-09", title: "왜 지금 영어 기초가 중요할까요[초등 중등 영어]", link: "https://blog.naver.com/sukjoon331/224470208077" },
  { date: "2026-11-16", title: "알파벳은 아는데 왜 문장을 못 읽을까요? [백운호수초 영어 학습]", link: "https://blog.naver.com/sukjoon331/224479100414" },
];

export function dailySeries(): DailyPoint[] {
  return DAILY_VIEWS.map((views, i) => {
    const d = new Date(DAILY_FROM + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const posts = POSTS_IN_RANGE.filter((p) => p.date === iso);
    return {
      date: iso,
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`,
      views,
      post: posts.length ? posts.map((p) => p.title).join(" / ") : undefined,
    };
  });
}

/** 월별 조회수·순방문자수 (통계 표의 정확한 값). 순방문자 25.10~26.04는 그래프에서 읽은 대략값, 11월은 조회수만 22일까지 합계 */
export const MONTHLY: MonthPoint[] = [
  { label: "25.10", views: 61, visitors: 34, visitorsApprox: true },
  { label: "25.11", views: 58, visitors: 29, visitorsApprox: true },
  { label: "25.12", views: 163, visitors: 54, visitorsApprox: true },
  { label: "26.01", views: 78, visitors: 28, visitorsApprox: true },
  { label: "26.02", views: 132, visitors: 50, visitorsApprox: true },
  { label: "26.03", views: 87, visitors: 27, visitorsApprox: true },
  { label: "26.04", views: 105, visitors: 69, visitorsApprox: true },
  { label: "26.05", views: 106, visitors: 44 },
  { label: "26.06", views: 47, visitors: 15 },
  { label: "26.07", views: 54, visitors: 27 },
  { label: "26.08", views: 79, visitors: 58 },
  { label: "26.09", views: 51, visitors: 11 },
  { label: "26.10", views: 36, visitors: 21 },
  {
    label: `${String(LAST.getUTCFullYear()).slice(2)}.${pad2(LAST.getUTCMonth() + 1)}`,
    views: DAILY_VIEWS.slice(-LAST.getUTCDate()).reduce((s, v) => s + v, 0),
    untilDay: LAST.getUTCDate(),
  },
];

/** 시간대 분석: 일간 화면만 있어 원장님이 본 경향을 글로 기록 */
export const PEAK_TIME = "오후 2시 ~ 5시";

/** 유입 경로 비율(%) — 네이버 분류를 원장님이 보기 쉬운 묶음으로 합친 값 */
export const SOURCE_PERIODS = ["10월 전체", "11.09 ~ 11.15", "11.16 ~ 11.22"] as const;
/** search = 검색엔진에서 온 방문 (검색 비율 계산에 씀) */
export const SOURCES: { label: string; hint: string; search: boolean; values: [number, number, number] }[] = [
  { label: "블로그 안에서 이동", search: false, hint: "글 목록·다른 글·블로그 홈에서 넘어온 방문 (처음 시작은 검색·지도인 경우가 많음)", values: [41.4, 65.4, 75] },
  { label: "네이버 지도·플레이스", search: false, hint: "학원 플레이스의 블로그 탭·홈에서 넘어온 방문", values: [13.8, 19.2, 12.5] },
  { label: "네이버 검색", search: true, hint: "통합검색·이미지검색", values: [17.2, 11.5, 12.5] },
  { label: "구글", search: true, hint: "", values: [13.8, 3.8, 0] },
  { label: "다음 검색", search: true, hint: "", values: [10.3, 0, 0] },
  { label: "인스타그램 등", search: false, hint: "", values: [3.4, 0, 0] },
];

/** 실제로 블로그에 들어온 검색어 (유입분석 상세 + 플레이스·블로그 주소에 남은 검색어) */
export type KeywordGroup = { group: string; note: string; items: { kw: string; where: string; when: string }[] };
export const ARRIVED_KEYWORDS: KeywordGroup[] = [
  {
    group: "학원 이름으로 찾아온 검색",
    note: "이미 학원을 아는 학부모",
    items: [
      { kw: "백운밸리 해법영어", where: "네이버 통합검색(모바일)", when: "11월 3주" },
      { kw: "스마트해법 태블릿", where: "네이버 통합검색(PC)", when: "11월 3주" },
      { kw: "백운밸리 해법", where: "네이버 통합검색(PC)", when: "11월 2주" },
      { kw: "해법수학 백운밸리 가격", where: "네이버 통합검색(PC)", when: "11월 2주" },
      { kw: "스마트해법영어", where: "네이버 지도 검색 → 플레이스", when: "11월 2주" },
      { kw: "스마트해법영어원서교제", where: "네이버 이미지검색(PC)", when: "10월" },
    ],
  },
  {
    group: "동네·학교로 찾아온 검색",
    note: "아직 학원을 모르는 새 학부모 — 가장 늘려야 할 유입",
    items: [
      { kw: "청계동 영어학원", where: "네이버 지도 검색 → 플레이스 → 블로그", when: "11월 2주" },
      { kw: "의왕영어학원", where: "블로그 글 주소에 남은 검색어", when: "11월 2주" },
      { kw: "백운호수초등학교", where: "네이버 이미지검색(PC)", when: "11월 2주" },
      { kw: "백운초등학교영어", where: "네이버 통합검색(모바일)", when: "10월" },
      { kw: "의왕영어체험학습", where: "다음 검색(모바일)", when: "10월" },
    ],
  },
  {
    group: "시즌 정보로 찾아온 검색",
    note: "학원과 상관없는 궁금증 → 글을 읽고 학원을 알게 됨",
    items: [
      { kw: "요즘 할로윈때 영어학원 이벤트 뭘하나요?", where: "네이버 이미지검색(모바일)", when: "10월" },
      { kw: "할러윈", where: "네이버 이미지검색(PC)", when: "10월" },
      { kw: "할러윈의 유래", where: "다음 검색(모바일)", when: "10월" },
      { kw: "할로윈이 무엇인가", where: "다음 검색(PC)", when: "10월" },
    ],
  },
];

/** 네이버 검색광고 키워드 도구 — 월간 검색수 (PC+모바일, 10 미만은 '<10') */
export type KeywordVolume = { kw: string; pc: number | null; mobile: number | null; comp: "낮음" | "중간" | "높음"; note: string };
export const KEYWORD_VOLUMES: KeywordVolume[] = [
  { kw: "의왕영어학원", pc: 40, mobile: 650, comp: "중간", note: "학부모가 가장 많이 치는 학원 검색어. 광고 7개가 위에 붙어 블로그는 그 아래에 나와요" },
  { kw: "스마트해법영어", pc: 280, mobile: 1390, comp: "중간", note: "브랜드 이름. 제목 [ ]에 '스마트해법영어'를 넣으면 이 검색에 함께 노출될 수 있어요" },
  { kw: "해법", pc: 190, mobile: 550, comp: "중간", note: "범위가 넓어 학원 글이 상위에 오르기 어려움" },
  { kw: "백운밸리", pc: 170, mobile: 530, comp: "중간", note: "동네 이름 검색. 월 600~880회(모바일)로 꾸준함" },
  { kw: "스마트해법", pc: 250, mobile: 420, comp: "중간", note: "클릭률 5~6%로 높음 — 찾는 사람이 분명함" },
  { kw: "덕장중", pc: 80, mobile: 100, comp: "낮음", note: "광고 0개 — 블로그 글이 바로 보이는 검색어. 덕장중 분석 글이 최근 주 가장 많이 읽혔어요" },
  { kw: "청계동영어학원", pc: 80, mobile: 70, comp: "높음", note: "지도에서 이 검색어로 찾아온 기록이 있어요" },
  { kw: "의왕백운밸리", pc: 150, mobile: 350, comp: "중간", note: "" },
  { kw: "초등단원평가문제집", pc: 30, mobile: 170, comp: "중간", note: "초등 학부모 정보 검색" },
  { kw: "백운밸리영어", pc: null, mobile: null, comp: "낮음", note: "검색 거의 없음 — 대신 경쟁도 없음" },
  { kw: "백운밸리학원", pc: null, mobile: null, comp: "낮음", note: "검색 거의 없음" },
  { kw: "학의동영어학원", pc: null, mobile: null, comp: "중간", note: "검색 거의 없음 — 예전 글 제목 [학의동영어학원]보다 [의왕 영어학원]이 유리" },
];
/** 10월 조회수 순위 (게시물) */
export const TOP_POSTS_OCT: { title: string; views: number; written: string }[] = [
  { title: "영어가 재미있어지는 순간, 아이들의 태도가 바뀝니다[의왕 영어]", views: 4, written: "2026.10.02" },
  { title: "할러윈 이벤트[학의동영어학원]", views: 3, written: "2025.10.27" },
  { title: "아이에 맞는 속도, 반복학습의 결과[의왕 영어학원]", views: 2, written: "2025.11.14" },
  { title: "방학 특강, 이렇게 준비해서 진행하고 있습니다[의왕영어학원]", views: 2, written: "2026.01.06" },
  { title: "자신감이 올랐습니다[의왕 영어학원]", views: 2, written: "2026.04.09" },
  { title: "중간고사 목표 달성[의왕 영어학원]", views: 2, written: "2026.05.07" },
  { title: "여름방학 이벤트[의왕 영어]", views: 2, written: "2026.07.20" },
  { title: "반복학습의 결과, 두번째 최고의 학생 등장[초등 중등 영어]", views: 2, written: "2026.10.16" },
  { title: "할로윈이 무엇인지 아시나요[의왕 영어]", views: 2, written: "2026.10.27" },
];
export const TOP_POSTS_OCT_TOTAL = 16; // 10월에 1회 이상 읽힌 글 수

/** 키워드 도구에서 조회되지 않는 검색어 (광고 금지어) */
export const BLOCKED_KEYWORDS = ["백운호수초"];
