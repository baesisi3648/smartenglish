import "server-only";
import type { BlogPost } from "@/lib/blog";
import { POST_TYPES, classifyPost } from "./post-types";

/**
 * 블로그 분석 리포트 — 예시(목업) 데이터.
 * 네이버 블로그 통계는 API가 없어 지금은 불러올 수 없다. 나중에 원장님이 통계 화면 캡처를 올리면
 * AI가 숫자를 읽어 같은 모양(ReportData)으로 채운다. 그 전까지는 화면 구성 확인용 예시 수치.
 * 새로고침해도 숫자가 바뀌지 않도록 날짜 기반 고정 난수를 쓴다.
 */

export type DailyPoint = { date: string; label: string; visitors: number; views: number; posted: boolean };
export type Share = { label: string; value: number };
export type ReportData = {
  sample: true;
  period: { from: string; to: string };
  kpi: {
    visitors: number;
    visitorsPrev: number;
    views: number;
    viewsPrev: number;
    avgDaily: number;
    likes: number;
    comments: number;
    newNeighbors: number;
    posts: number;
  };
  daily: DailyPoint[];
  sources: Share[];
  keywords: Share[];
  topPosts: { title: string; link?: string; views: number; type: string }[];
  byType: { id: string; label: string; emoji: string; avgViews: number; posts: number }[];
  /** [요일 0=월 … 6=일][시간대] 평균 조회수 */
  heatmap: { days: string[]; slots: string[]; values: number[][] };
  insights: string[];
};

/** 고정 시드 난수 (mulberry32) */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

const FALLBACK_TITLES = [
  "알파벳은 아는데 왜 문장을 못 읽을까요? [백운호수초 영어 학습]",
  "덕장중 2학기 중간고사 분석 [덕장중 3학년]",
  "왜 지금 영어 기초가 중요할까요[초등 중등 영어]",
  "겨울방학, 영어 습관을 잡는 가장 좋은 시간[의왕 영어학원]",
  "할로윈 영어 미션 데이 후기[백운호수초]",
];

export function buildMockReport(today: Date, posts: BlogPost[]): ReportData {
  const rand = rng(today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate());
  const days = 30;
  const start = new Date(today.getTime() - (days - 1) * DAY);

  // 일별 방문자: 평일 > 주말, 완만한 상승, 글 올린 날과 다음 날 반짝 증가
  const postDays = new Set([2, 6, 9, 13, 17, 20, 24, 27]);
  const daily: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 38 + i * 0.55;
    const bump = postDays.has(i) ? 24 : postDays.has(i - 1) ? 11 : 0;
    const visitors = Math.round((trend + bump) * (weekend ? 0.72 : 1) + rand() * 10 - 4);
    const views = Math.round(visitors * (1.45 + rand() * 0.35));
    daily.push({ date: ymd(d), label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[dow]})`, visitors, views, posted: postDays.has(i) });
  }
  const visitors = daily.reduce((s, p) => s + p.visitors, 0);
  const views = daily.reduce((s, p) => s + p.views, 0);

  const sources: Share[] = [
    { label: "네이버 통합검색", value: 57 },
    { label: "네이버 블로그 검색", value: 14 },
    { label: "네이버 지도·플레이스", value: 11 },
    { label: "이웃 새 글 소식", value: 9 },
    { label: "인스타그램·카카오톡", value: 6 },
    { label: "기타", value: 3 },
  ];

  const keywords: Share[] = [
    { label: "의왕 영어학원", value: 214 },
    { label: "학의동 영어", value: 151 },
    { label: "백운호수초 영어", value: 97 },
    { label: "덕장중 기말고사", value: 83 },
    { label: "의왕 파닉스", value: 66 },
    { label: "백운밸리 영어학원", value: 58 },
    { label: "중등 내신 영어", value: 44 },
    { label: "스마트해법영어", value: 39 },
  ];

  const titles = (posts.length ? posts.map((p) => ({ title: p.title, link: p.link })) : FALLBACK_TITLES.map((t) => ({ title: t }))).slice(0, 5);
  const topPosts = titles.map((p, i) => ({
    ...p,
    views: Math.round(412 / (1 + i * 0.42) + rand() * 15),
    type: classifyPost(p.title) ?? "column",
  }));

  const avgByType: Record<string, [number, number]> = {
    exam: [188, 6],
    event: [146, 4],
    column: [121, 7],
    growth: [98, 5],
    season: [87, 6],
  };
  const byType = POST_TYPES.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, avgViews: avgByType[t.id][0], posts: avgByType[t.id][1] })).sort(
    (a, b) => b.avgViews - a.avgViews,
  );

  // 요일×시간대: 점심 직후와 밤 9시 이후(학부모 퇴근·아이 재운 뒤)가 높음, 주말 오전 약간
  const slots = ["오전 6–12시", "12–15시", "15–18시", "18–21시", "21–24시"];
  const base = [0.45, 0.85, 0.6, 0.75, 1.0];
  const dayFactor = [0.95, 1.05, 1.1, 1.0, 0.9, 0.7, 0.75];
  const values = dayFactor.map((f, di) =>
    base.map((b, si) => Math.round(18 * b * f * (di >= 5 && si === 0 ? 1.6 : 1) + rand() * 3)),
  );

  const prevVisitors = Math.round(visitors * 0.86);
  const prevViews = Math.round(views * 0.88);
  const best = byType[0];
  const worst = byType[byType.length - 1];

  // 가장 높은 요일·시간대
  let peak = { d: 0, s: 0, v: 0 };
  values.forEach((row, d) => row.forEach((v, s) => v > peak.v && (peak = { d, s, v })));
  const dayNames = ["월", "화", "수", "목", "금", "토", "일"];

  const insights = [
    `${best.emoji} '${best.label}' 글의 평균 조회수가 ${best.avgViews}회로 가장 높습니다. '${worst.label}'(${worst.avgViews}회)의 약 ${(best.avgViews / worst.avgViews).toFixed(1)}배예요.`,
    `🔎 방문의 ${sources[0].value + sources[1].value}%가 네이버 검색에서 옵니다. 제목 끝 [키워드]와 본문 앞부분 키워드가 가장 중요합니다.`,
    `📈 '${keywords[0].label}' 검색 유입이 가장 많습니다. 다음 글의 대표 키워드로 추천해요.`,
    `🕘 ${dayNames[peak.d]}요일 ${slots[peak.s]}에 조회가 가장 많습니다. 이 시간 전에 글을 올리면 좋아요.`,
    `📝 글을 올린 날과 다음 날 방문자가 평소보다 크게 늘었습니다. 주 2회 꾸준히 올리는 것을 추천해요.`,
  ];

  return {
    sample: true,
    period: { from: ymd(start), to: ymd(today) },
    kpi: {
      visitors,
      visitorsPrev: prevVisitors,
      views,
      viewsPrev: prevViews,
      avgDaily: Math.round(visitors / days),
      likes: 132,
      comments: 23,
      newNeighbors: 14,
      posts: postDays.size,
    },
    daily,
    sources,
    keywords,
    topPosts,
    byType,
    heatmap: { days: dayNames, slots, values },
    insights,
  };
}
