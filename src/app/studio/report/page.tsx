import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { passwordConfigured, verifySessionToken, SESSION_COOKIE } from "@/studio/auth";
import { studioEnabled } from "@/studio/guard";
import {
  ARRIVED_KEYWORDS,
  KEYWORD_VOLUMES,
  MONTHLY,
  monthName,
  weekRange,
  NEIGHBOR_VIEWS_90D,
  PEAK_TIME,
  BLOCKED_KEYWORDS,
  POSTS_IN_RANGE,
  SOURCES,
  SOURCE_PERIODS,
  TOP_POSTS_OCT,
  TOP_POSTS_OCT_TOTAL,
  dailySeries,
} from "@/studio/report-data";
import { DailyChart, MonthlyBars } from "./charts";

export const metadata: Metadata = {
  title: "블로그 분석 리포트 | 스마트해법영어 백운밸리점",
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString("ko-KR");
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-5 ring-1 ring-line ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-round text-lg text-hb-navy">{title}</h2>
        {sub && <p className="text-xs text-ink-soft">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

async function Report() {
  await connection(); // 로그인 확인은 요청마다 (미리 렌더링 금지)
  if (!studioEnabled() || !passwordConfigured()) redirect("/studio");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) redirect("/studio");

  const daily = dailySeries();
  const views = daily.map((d) => d.views);
  const total90 = sum(views);
  const lastWeek = sum(views.slice(-7));
  const prevWeek = sum(views.slice(-14, -7));
  const nov = MONTHLY[MONTHLY.length - 1].views;
  const oct = MONTHLY[MONTHLY.length - 2].views;
  const searchShare = SOURCE_PERIODS.map((_, i) =>
    Math.round(SOURCES.filter((s) => s.search).reduce((a, s) => a + s.values[i], 0)),
  );
  const top = [...daily].sort((a, b) => b.views - a.views).slice(0, 4);
  const kv = (kw: string) => KEYWORD_VOLUMES.find((k) => k.kw === kw)!;
  const vol = (k: { pc: number | null; mobile: number | null }) => (k.pc ?? 0) + (k.mobile ?? 0);
  const academy = kv("의왕영어학원");
  const school = kv("덕장중");
  const brand = kv("스마트해법영어");
  const curM = MONTHLY[MONTHLY.length - 1];
  const octM = MONTHLY[MONTHLY.length - 2];
  const curName = monthName(curM.label);
  const prevName = monthName(octM.label);
  const ym = (label: string) => `20${label.replace(".", "-")}`;
  const novPosts = POSTS_IN_RANGE.filter((p) => p.date.startsWith(ym(curM.label))).length;
  const octPosts = POSTS_IN_RANGE.filter((p) => p.date.startsWith(ym(octM.label))).length;

  const tiles = [
    {
      label: `${curName} 조회수${curM.untilDay ? ` (${curM.untilDay}일까지)` : ""}`,
      value: `${fmt(nov)}회`,
      note: <span className="font-bold text-emerald-700">{prevName} 전체 {oct}회의 {(nov / oct).toFixed(1)}배</span>,
    },
    {
      label: "최근 1주 조회수",
      value: `${fmt(lastWeek)}회`,
      note: <span>{weekRange(0)} · 그 전 주 {prevWeek}회</span>,
    },
    {
      label: "검색으로 들어온 비율",
      value: `${searchShare[2]}%`,
      note: <span>{SOURCE_PERIODS[2]} · {SOURCE_PERIODS[0]} {searchShare[0]}%</span>,
    },
    {
      label: "이웃이 본 조회",
      value: `${NEIGHBOR_VIEWS_90D}회`,
      note: <span>90일 조회 {fmt(total90)}회 중</span>,
    },
  ];

  const novTop = top.filter((d) => d.date.startsWith(ym(curM.label)));
  const insights: { icon: string; head: string; body: string }[] = [
    {
      icon: "📈",
      head: `${curName} 조회수, ${prevName}의 ${(nov / oct).toFixed(1)}배`,
      body: `${curM.untilDay ? `${curM.untilDay}일까지 ` : ""}${nov}회 (${prevName} ${oct}회 · 순방문자 ${octM.visitors}명). 글 수는 ${octPosts}편 → ${novPosts}편으로 같고, 11월 글엔 학교 이름이 들어갔어요.`,
    },
    {
      icon: "📝",
      head: "글 올린 날 전후로 조회가 몰려요",
      body: `${novTop.map((d) => `${d.label} ${d.views}회`).join(" · ")}. 글이 없던 주는 일주일 2회 → 주 2회 꾸준히.`,
    },
    {
      icon: "🔎",
      head: "검색 유입은 아직 '학원 이름' 위주",
      body: `검색 비율 ${searchShare[0]}% → ${searchShare[2]}%. 새 학부모를 데려오는 동네·학교 검색을 늘려야 해요.`,
    },
    {
      icon: "🔤",
      head: `'${academy.kw}' 한 달 ${fmt(vol(academy))}회 — 가장 큰 검색어`,
      body: `휴대폰 ${Math.round(((academy.mobile ?? 0) / vol(academy)) * 100)}%, 광고 경쟁 있음. 제목 [의왕 영어학원] 추천. 브랜드 '${brand.kw}'도 월 ${fmt(vol(brand))}회.`,
    },
    {
      icon: "🏫",
      head: `'${school.kw}'은 광고 없는 기회 검색어`,
      body: `월 ${vol(school)}회, 광고 0개라 블로그가 바로 보여요. 덕장중 분석 글이 최근 주 1위. (${BLOCKED_KEYWORDS.join(", ")}는 광고 금지어라 검색량만 안 나옴)`,
    },
    {
      icon: "📍",
      head: "지도 → 블로그 유입 13~19%",
      body: "'청계동 영어학원' 지도 검색 → 플레이스 → 블로그. 플레이스에 새 글이 보이게 유지하세요.",
    },
    {
      icon: "🎃",
      head: "시즌 글은 해마다 다시 읽혀요",
      body: "10월 검색 유입의 절반이 할로윈. 작년 할러윈 글이 올해 10월 2위 → 크리스마스·겨울방학 글을 미리.",
    },
    {
      icon: "🕑",
      head: `${PEAK_TIME}에 가장 많이 봐요`,
      body: "점심 무렵(오후 1시 전후)에 올리면 가장 많이 볼 때 새 글이 걸려 있어요.",
    },
    {
      icon: "👥",
      head: `이웃 조회 ${fmt(total90)}회 중 ${NEIGHBOR_VIEWS_90D}회`,
      body: "새 글 알림 유입이 거의 없어요. 재원생 학부모께 이웃 추가 부탁, 글 링크 카톡 공유.",
    },
  ];

  return (
    <div className="min-h-dvh bg-bg-soft">
      <header className="border-b-[3px] border-hb-blue bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="font-display text-xl text-hb-navy">블로그 분석 리포트</p>
          </div>
          <Link href="/studio" className="text-sm font-bold text-hb-navy underline">
            ← 블로그 스튜디오
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <p className="text-xs font-bold text-ink-soft">{t.label}</p>
              <p className="mt-1 font-display text-2xl text-ink sm:text-3xl">{t.value}</p>
              <p className="mt-1 text-xs text-ink-soft">{t.note}</p>
            </div>
          ))}
        </div>

        <Panel title="일별 조회수" sub={`최근 ${daily.length}일 · ● 글 올린 날 (점에 마우스를 올리면 글 제목)`}>
          <DailyChart data={daily} />
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-ink-soft">표로 보기</summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="sticky top-0 bg-white text-ink-soft">
                  <tr>
                    <th className="py-1">날짜</th>
                    <th>조회수</th>
                    <th>올린 글</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map((d) => (
                    <tr key={d.date} className="border-t border-line">
                      <td className="py-1 whitespace-nowrap">{d.label}</td>
                      <td>{fmt(d.views)}</td>
                      <td className="truncate">{d.post ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>

        <section className="rounded-2xl bg-hb-navy p-5 text-white">
          <h2 className="font-round text-lg">💡 핵심 분석</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((t) => (
              <li key={t.head} className="rounded-xl bg-white/10 p-4">
                <p className="flex items-start gap-2 text-[15px] font-extrabold leading-snug">
                  <span aria-hidden>{t.icon}</span>
                  <span>{t.head}</span>
                </p>
                <p className="mt-1.5 text-xs leading-5 text-white/75">{t.body}</p>
              </li>
            ))}
          </ul>
          <Link href="/studio" className="mt-4 inline-block rounded-full bg-hb-yellow px-5 py-2.5 text-sm font-extrabold text-ink">
            이 분석으로 다음 글 쓰러 가기 →
          </Link>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="월별 조회수" sub="최근 14개월">
            <MonthlyBars data={MONTHLY} />
          </Panel>
          <Panel title="어디서 들어왔나요" sub="유입 경로 비율 (%)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-ink-soft">
                  <tr>
                    <th className="pb-2 text-left font-normal">경로</th>
                    {SOURCE_PERIODS.map((p) => {
                      const [from, to] = p.split(" ~ ");
                      return (
                        <th key={p} className="pb-2 pl-3 text-right align-bottom font-normal leading-4 whitespace-nowrap">
                          {to ? (
                            <>
                              {from} ~
                              <br />
                              {to}
                            </>
                          ) : (
                            p
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s.label} className="border-t border-line align-top">
                      <td className="py-2 pr-2">
                        <p className="font-bold">{s.label}</p>
                        {s.hint && <p className="text-xs text-ink-soft">{s.hint}</p>}
                      </td>
                      {s.values.map((v, i) => (
                        <td key={i} className="py-2 pl-3 text-right">
                          <span className="font-bold">{v ? v : "–"}</span>
                          <span
                            className="mt-1 ml-auto block h-1.5 rounded-full bg-hb-blue"
                            style={{ width: `${Math.max(v, 0)}%`, opacity: v ? 1 : 0 }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-soft">
              한 주 방문이 20~60회라 비율이 크게 움직여요. 여러 주를 함께 보세요.
            </p>
          </Panel>
        </div>

        <Panel title="실제로 들어온 검색어" sub="유입분석 상세 경로에서 찾은 검색어">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ARRIVED_KEYWORDS.map((g) => (
              <div key={g.group} className="rounded-xl bg-bg-soft p-4">
                <p className="font-bold text-hb-navy">{g.group}</p>
                <p className="text-xs text-ink-soft">{g.note}</p>
                <ul className="mt-3 space-y-2">
                  {g.items.map((it) => (
                    <li key={it.kw} className="text-sm">
                      <p className="font-bold">&lsquo;{it.kw}&rsquo;</p>
                      <p className="text-xs text-ink-soft">
                        {it.where} · {it.when}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Panel title="검색어별 한 달 검색량" sub="네이버 키워드 도구 · PC + 모바일">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-ink-soft">
                  <tr>
                    <th className="pb-2 text-left font-normal">검색어</th>
                    <th className="pb-2 text-right font-normal">월 검색</th>
                    <th className="pb-2 text-right font-normal">휴대폰</th>
                    <th className="pb-2 pl-3 text-left font-normal">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {KEYWORD_VOLUMES.map((k) => {
                    const total = k.pc !== null && k.mobile !== null ? k.pc + k.mobile : null;
                    return (
                      <tr key={k.kw} className="border-t border-line align-top">
                        <td className="py-2 pr-2 font-bold whitespace-nowrap">{k.kw}</td>
                        <td className="py-2 text-right whitespace-nowrap">{total === null ? "20 미만" : `${fmt(total)}회`}</td>
                        <td className="py-2 text-right">{total ? `${Math.round(((k.mobile ?? 0) / total) * 100)}%` : "–"}</td>
                        <td className="py-2 pl-3 text-xs leading-5 text-ink-soft">{k.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-soft">
              &lsquo;백운호수&rsquo;(월 15,340회)는 검색이 많지만 대부분 맛집·카페를 찾는 검색이라 학원 글과는 맞지 않아요.
            </p>
          </Panel>

          <Panel title="10월에 많이 읽힌 글" sub={`조회수 순위 · 1회 이상 읽힌 글 ${TOP_POSTS_OCT_TOTAL}편`}>
            <ol className="divide-y divide-line">
              {TOP_POSTS_OCT.map((p, i) => (
                <li key={p.title} className="flex items-center gap-3 py-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-soft text-xs font-bold text-hb-navy">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.title}</p>
                    <p className="text-xs text-ink-soft">
                      {p.written} 작성{p.written < "2026.10" ? " · 예전 글" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {p.views}
                    <span className="ml-0.5 text-xs font-normal text-ink-soft">회</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

      </main>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-bg-soft text-sm text-ink-soft">불러오는 중…</main>}>
      <Report />
    </Suspense>
  );
}
