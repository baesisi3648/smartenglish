import "server-only";
import type { BlogPost } from "@/lib/blog";
import { analyzePosts, upcomingSeasons, type PlanIdea } from "./planner";

/**
 * 추천 주제 (AI 없이 즉시): 주제 칸 위에 칩으로 띄워, 누르면 글 유형·주제·키워드가 채워진다.
 * 1) 다가오는 학사 시기에 맞는 주제  2) 오래 안 쓴 글 유형의 상시 주제
 * 최근 글 제목과 핵심어가 겹치면 뺀다. 사실(날짜·비용·결과)은 needs 로만 받는다.
 */

export type QuickIdea = PlanIdea & { id: string; source: "season" | "gap" };

type Seed = Omit<PlanIdea, "reason"> & { id: string; /** 최근 제목에 이 단어가 있으면 이미 쓴 주제로 본다 */ dup: RegExp };

const SEASON_SEEDS: Record<string, Seed[]> = {
  겨울방학: [
    {
      id: "winter-habit",
      type: "column",
      title: "겨울방학, 영어 공부 습관 잡는 법",
      outline: ["방학에 흐트러지기 쉬운 공부 리듬", "하루 영어 루틴 만들기", "교습소 1:1 학습으로 이어 가는 방법"],
      needs: [],
      keywords: ["방학 특강", "초등 중등 영어", "의왕 영어"],
      dup: /방학.*(습관|루틴)/,
    },
  ],
  "새 학년 준비": [
    {
      id: "new-grade",
      type: "column",
      title: "새 학년 영어, 지금 준비할 것",
      outline: ["학년이 올라가며 달라지는 영어", "방학 동안 다져 둘 기초", "아이별 진단으로 시작하는 1:1 학습"],
      needs: [],
      keywords: ["초등 중등 영어", "의왕 영어학원"],
      dup: /새 ?학년/,
    },
  ],
  "새 학기·학부모 상담 시기": [
    {
      id: "new-term",
      type: "column",
      title: "새 학기 영어, 아이가 적응하고 있을까요?",
      outline: ["새 학기에 흔한 영어 고민", "집에서 확인해 볼 신호", "상담으로 학습 방향 잡기"],
      needs: [],
      keywords: ["초등 영어", "의왕 영어"],
      dup: /새 ?학기/,
    },
  ],
  "1학기 중간고사": [
    {
      id: "midterm1",
      type: "exam",
      title: "1학기 중간고사 대비, 이렇게 준비해요",
      outline: ["학교별 출제 경향 살피기", "교과서 본문·문법 정리", "아이별 약점 보완"],
      needs: ["대비하는 학교·학년", "대비 기간이나 방식"],
      keywords: ["중간고사", "중등 내신", "덕장중"],
      dup: /1학기.*중간|중간고사.*대비/,
    },
  ],
  "1학기 기말고사": [
    {
      id: "final1",
      type: "exam",
      title: "1학기 기말고사, 지금 점검할 것",
      outline: ["기말 범위와 출제 경향", "서술형 대비", "시험 직전 복습 방법"],
      needs: ["대비하는 학교·학년"],
      keywords: ["기말고사", "중등 내신", "백운중"],
      dup: /1학기.*기말|기말고사.*(대비|점검)/,
    },
  ],
  "여름방학 특강 모집": [
    {
      id: "summer-camp",
      type: "event",
      title: "여름방학 특강 안내",
      outline: ["특강 대상과 목표", "수업 진행 방식", "신청 방법"],
      needs: ["특강 기간", "대상·인원", "비용·혜택"],
      keywords: ["방학 특강", "의왕 영어학원"],
      dup: /여름.*(특강|이벤트)/,
    },
  ],
  여름방학: [
    {
      id: "summer-preview",
      type: "column",
      title: "여름방학, 2학기 영어 미리 준비하기",
      outline: ["방학에 보충할 부분 찾기", "2학기 예습 방향", "꾸준한 반복 학습"],
      needs: [],
      keywords: ["방학 특강", "초등 중등 영어"],
      dup: /2학기.*(예습|준비)/,
    },
  ],
  "2학기 시작": [
    {
      id: "term2",
      type: "column",
      title: "2학기 영어, 다시 리듬 찾기",
      outline: ["방학 뒤 흐트러진 습관", "2학기 학습 계획", "아이별 맞춤 진도"],
      needs: [],
      keywords: ["초등 중등 영어", "의왕 영어"],
      dup: /2학기.*(시작|리듬|적응)/,
    },
  ],
  "2학기 중간고사": [
    {
      id: "midterm2",
      type: "exam",
      title: "2학기 중간고사 대비, 이렇게 준비해요",
      outline: ["학교별 출제 경향 살피기", "문법·서술형 정리", "아이별 약점 보완"],
      needs: ["대비하는 학교·학년", "대비 기간이나 방식"],
      keywords: ["중간고사", "중등 내신", "덕장중"],
      dup: /2학기.*중간.*대비/,
    },
  ],
  할로윈: [
    {
      id: "halloween",
      type: "season",
      title: "영어로 즐기는 할로윈",
      outline: ["할로윈 이야기", "영어 표현과 활동", "아이들의 즐거운 시간"],
      needs: ["행사 날짜", "실제로 한 활동"],
      keywords: ["백운호수초", "초등 영어"],
      dup: /할로윈/,
    },
  ],
  수능: [
    {
      id: "suneung",
      type: "column",
      title: "수능 영어, 초·중등 때 준비할 것",
      outline: ["수능 영어가 보는 힘", "초·중등 시기에 쌓을 기초", "꾸준한 독해·어휘 습관"],
      needs: [],
      keywords: ["초등 중등 영어", "의왕 영어학원"],
      dup: /수능/,
    },
  ],
  "2학기 기말고사": [
    {
      id: "final2",
      type: "exam",
      title: "2학기 기말고사, 지금 점검할 것",
      outline: ["기말 범위와 출제 경향", "서술형·문법 대비", "시험 직전 복습 방법"],
      needs: ["대비하는 학교·학년"],
      keywords: ["기말고사", "중등 내신", "백운중"],
      dup: /2학기.*기말|기말고사.*(대비|점검)/,
    },
  ],
  "겨울방학 특강 모집·크리스마스": [
    {
      id: "winter-camp",
      type: "event",
      title: "겨울방학 특강 안내",
      outline: ["특강 대상과 목표", "수업 진행 방식", "신청 방법"],
      needs: ["특강 기간", "대상·인원", "비용·혜택"],
      keywords: ["방학 특강", "의왕 영어학원"],
      dup: /겨울.*(특강|이벤트)/,
    },
    {
      id: "christmas",
      type: "season",
      title: "영어로 만나는 크리스마스",
      outline: ["크리스마스 영어 표현", "수업 속 시즌 활동", "아이들의 즐거운 시간"],
      needs: ["행사 날짜", "실제로 한 활동"],
      keywords: ["백운호수초", "초등 영어"],
      dup: /크리스마스/,
    },
  ],
};

/** 유형별 상시 주제 (오래 안 쓴 유형을 채울 때) */
const EVERGREEN: Record<string, Seed[]> = {
  column: [
    {
      id: "phonics-why",
      type: "column",
      title: "파닉스, 왜 먼저 해야 할까요?",
      outline: ["소리와 글자를 잇는 파닉스", "파닉스 다음 읽기 단계", "아이 속도에 맞춘 1:1 학습"],
      needs: [],
      keywords: ["파닉스", "초등 영어", "의왕 영어"],
      dup: /파닉스.*(왜|먼저|중요)/,
    },
    {
      id: "vocab-habit",
      type: "column",
      title: "단어는 외웠는데 문장이 어려운 이유",
      outline: ["단어와 문장 읽기의 차이", "문장 속에서 단어 익히기", "반복 확인으로 기억 굳히기"],
      needs: [],
      keywords: ["초등 중등 영어", "의왕 영어학원"],
      dup: /단어.*문장|문장.*단어/,
    },
    {
      id: "reading-habit",
      type: "column",
      title: "영어 책 읽기, 매일 10분의 힘",
      outline: ["짧아도 매일 읽는 습관", "아이 수준에 맞는 책 고르기", "읽은 내용을 말로 확인하기"],
      needs: [],
      keywords: ["영어 원서 읽기", "초등 영어"],
      dup: /책 ?읽기|원서|독서/,
    },
    {
      id: "grammar-when",
      type: "column",
      title: "영어 문법, 언제부터 시작할까요?",
      outline: ["문법을 시작하기 좋은 때", "외우기보다 문장으로 익히기", "중등 내신과 이어지는 기초"],
      needs: [],
      keywords: ["중등 영어", "초등 중등 영어"],
      dup: /문법.*(언제|시작)/,
    },
    {
      id: "home-help",
      type: "column",
      title: "집에서 영어 공부, 부모님이 도와줄 수 있는 것",
      outline: ["잔소리보다 관심", "칭찬으로 이어 가는 습관", "교습소와 함께 확인하는 학습"],
      needs: [],
      keywords: ["초등 영어", "의왕 영어"],
      dup: /집에서|부모님이/,
    },
    {
      id: "one-on-one",
      type: "column",
      title: "1:1 맞춤 학습이 필요한 이유",
      outline: ["아이마다 다른 속도와 빈틈", "진단 → 맞춤 진도 → 반복 확인", "스스로 하는 힘으로 이어지는 과정"],
      needs: [],
      keywords: ["의왕 영어학원", "초등 중등 영어"],
      dup: /1:1|맞춤 학습/,
    },
  ],
  growth: [
    {
      id: "growth-habit",
      type: "growth",
      title: "스스로 공부하는 습관이 생겼어요",
      outline: ["처음 모습", "달라진 학습 태도", "꾸준함이 만든 변화"],
      needs: ["어떤 학년 친구들의 이야기인지", "실제로 달라진 점"],
      keywords: ["초등 중등 영어", "의왕 영어"],
      dup: /습관|스스로/,
    },
  ],
  event: [
    {
      id: "free-trial",
      type: "event",
      title: "무료 레벨테스트 안내",
      outline: ["레벨테스트로 알 수 있는 것", "진행 방법", "상담 신청 방법"],
      needs: ["진행 기간", "대상", "혜택·조건"],
      keywords: ["무료 체험", "의왕 영어학원"],
      dup: /레벨 ?테스트|무료/,
    },
  ],
  exam: [
    {
      id: "exam-review",
      type: "exam",
      title: "시험이 끝난 뒤가 더 중요한 이유",
      outline: ["시험 결과 돌아보기", "틀린 문제로 약점 찾기", "다음 시험까지의 계획"],
      needs: ["어느 학교·시험 이야기인지"],
      keywords: ["중등 내신", "의왕 영어"],
      dup: /시험.*(뒤|후)/,
    },
  ],
  season: [],
};

const DAY_LABEL = (d: number | null) => (d === null ? "아직 쓴 적이 없어요" : `${d}일째 안 썼어요`);
const MAX_IDEAS = 5;

export function quickIdeas(today: Date, posts: BlogPost[]): QuickIdea[] {
  const recent = posts.slice(0, 12).map((p) => p.title);
  const fresh = (s: Seed) => !recent.some((t) => s.dup.test(t));
  const out: QuickIdea[] = [];
  const push = (s: Seed, reason: string, source: QuickIdea["source"]) => {
    if (out.length >= MAX_IDEAS || out.some((o) => o.id === s.id) || !fresh(s)) return;
    const { dup, ...idea } = s;
    void dup;
    out.push({ ...idea, reason, source });
  };

  // 1) 진행 중인 시기 먼저, 그다음 다가오는 시기
  const seasons = upcomingSeasons(today).sort((a, b) => Number(b.ongoing) - Number(a.ongoing));
  for (const s of seasons) {
    for (const seed of SEASON_SEEDS[s.label] ?? []) push(seed, `📅 ${s.label} 시기 (${s.ongoing ? "지금" : "곧"})`, "season");
  }

  // 2) 오래 안 쓴 유형 순 (한 번도 없으면 가장 앞). 블로그 글을 못 불러왔으면(0편) 공백을 판단하지 않는다
  const gapReason = (label: string, daysAgo: number | null) =>
    posts.length ? `🗂 ${label} 글을 ${DAY_LABEL(daysAgo)}` : "💡 언제 올려도 좋은 주제";
  const gaps = analyzePosts(posts, today)
    .types.filter((t) => (EVERGREEN[t.id] ?? []).length > 0)
    .sort((a, b) => (b.daysAgo ?? 9999) - (a.daysAgo ?? 9999));
  for (const t of gaps) {
    for (const seed of EVERGREEN[t.id]) push(seed, gapReason(t.label.split(" · ")[0], t.daysAgo), "gap");
  }

  // 3) 원장님 정보 없이 바로 쓸 수 있는 주제(needs 없음)를 최소 1개 보장 — "오늘의 맞춤 추천"·자동 글용
  if (!out.some((o) => o.needs.length === 0)) {
    const column = gaps.find((t) => t.id === "column");
    const seed = EVERGREEN.column.find((s) => fresh(s) && !out.some((o) => o.id === s.id));
    if (seed) {
      if (out.length >= MAX_IDEAS) out.pop();
      push(seed, column ? gapReason("교육 정보 칼럼", column.daysAgo) : "💡 언제 올려도 좋은 주제", "gap");
    }
  }
  return out;
}
