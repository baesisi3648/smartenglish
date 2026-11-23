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
  NEIGHBOR_VIEWS_90D,
  PEAK_TIME,
  BLOCKED_KEYWORDS,
  POSTS_IN_RANGE,
  SOURCES,
  SOURCE_PERIODS,
  TOP_POSTS_OCT,
  TOP_POSTS_OCT_TOTAL,
  UPDATED,
  WANTED,
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
    Math.round(SOURCES.filter((s) => s.label.includes("검색")).reduce((a, s) => a + s.values[i], 0)),
  );
  const top = [...daily].sort((a, b) => b.views - a.views).slice(0, 4);
  const novPosts = POSTS_IN_RANGE.filter((p) => p.date.startsWith("2026-11")).length;
  const octPosts = POSTS_IN_RANGE.filter((p) => p.date.startsWith("2026-10")).length;
  const kv = (kw: string) => KEYWORD_VOLUMES.find((k) => k.kw === kw)!;
  const vol = (k: { pc: number | null; mobile: number | null }) => (k.pc ?? 0) + (k.mobile ?? 0);
  const academy = kv("의왕영어학원");
  const school = kv("덕장중");
  const brand = kv("스마트해법영어");
  const octM = MONTHLY[MONTHLY.length - 2];

  const tiles = [
    {
      label: "11월 조회수 (22일까지)",
      value: `${fmt(nov)}회`,
      note: <span className="font-bold text-emerald-700">10월 전체 {oct}회의 {(nov / oct).toFixed(1)}배</span>,
    },
    {
      label: "최근 1주 조회수",
      value: `${fmt(lastWeek)}회`,
      note: <span>11.16 ~ 11.22 · 그 전 주 {prevWeek}회</span>,
    },
    {
      label: "검색으로 들어온 비율",
      value: `${searchShare[2]}%`,
      note: <span>최근 1주 · 10월은 {searchShare[0]}%</span>,
    },
    {
      label: "이웃이 본 조회",
      value: `${NEIGHBOR_VIEWS_90D}회`,
      note: <span>90일 조회 {fmt(total90)}회 중</span>,
    },
  ];

  const insights = [
    `📈 11월은 22일까지 ${nov}회로 10월 전체(${oct}회)의 약 ${(nov / oct).toFixed(1)}배, 올해 5월(106회)보다도 많습니다. (10월 순방문자는 ${octM.visitors}명이었어요.) 글 수는 10월 ${octPosts}편, 11월 ${novPosts}편으로 같았는데, 11월 글은 제목·본문에 '백운호수초·덕장중'처럼 동네 학교 이름이 들어갔어요.`,
    `📝 조회가 많은 날은 대부분 글 올린 날 전후입니다 (${top
      .filter((d) => d.date >= "2026-11-01")
      .map((d) => `${d.label} ${d.views}회`)
      .join(", ")}). 글이 없던 10월 19~25일 주는 일주일에 2회뿐이었어요. 주 2회 꾸준히 올리는 게 가장 확실합니다.`,
    `🔎 검색으로 들어온 방문은 10월 ${searchShare[0]}% → 최근 주 ${searchShare[2]}%이고, 검색어 대부분이 '백운밸리 해법영어', '스마트해법 태블릿'처럼 학원 이름이에요. 이미 아는 학부모는 찾아오지만, 새 학부모를 데려오는 동네·학교 검색은 아직 적습니다.`,
    "📍 네이버 지도(플레이스)에서 블로그로 넘어온 방문이 13~19%로 꾸준합니다. '청계동 영어학원'을 지도에서 검색한 학부모가 플레이스 → 블로그로 들어왔어요. 플레이스에 블로그 새 글이 잘 보이게 유지하세요.",
    "🎃 10월 검색 유입의 절반이 할로윈 관련 검색이었고, 작년(2025.10) '할러윈 이벤트' 글이 올해 10월 조회 2위였습니다. 시즌 정보 글은 해마다 다시 읽혀요. 크리스마스·겨울방학·새 학기 글을 미리 써 두면 좋습니다.",
    `👥 90일 조회 ${fmt(total90)}회 중 이웃이 본 것은 ${NEIGHBOR_VIEWS_90D}회입니다. 새 글 알림으로 오는 방문이 거의 없으니, 재원생 학부모께 이웃 추가를 부탁하거나 글 링크를 카톡으로 함께 보내 주세요.`,
    `🔤 학부모가 가장 많이 치는 학원 검색어는 '${academy.kw}'(한 달 ${fmt(vol(academy))}회, ${Math.round(((academy.mobile ?? 0) / vol(academy)) * 100)}% 휴대폰)입니다. 광고가 많이 붙는 검색어라, 제목 [ ]에 '의왕 영어학원'을 넣어 블로그 탭·이미지에서라도 보이게 하는 게 좋아요. 브랜드 '${brand.kw}'도 한 달 ${fmt(vol(brand))}회 검색됩니다.`,
    `🏫 '${school.kw}'은 한 달 ${vol(school)}회 검색되는데 광고가 하나도 없어 블로그 글이 바로 보입니다. 실제로 덕장중 중간고사 분석 글이 최근 주 가장 많이 읽혔어요. 시험 분석·학교 소식 글을 꾸준히 올려 주세요. ('${BLOCKED_KEYWORDS.join(", ")}'는 키워드 도구에서 광고 금지어라 검색량이 안 나오지만, 실제 학부모 검색은 있습니다.)`,
    `🕑 블로그를 가장 많이 보는 시간은 ${PEAK_TIME}입니다. 그 전인 점심 무렵(오후 1시 전후)에 글을 올리면 가장 많이 볼 때 새 글이 걸려 있어요.`,
  ];

  return (
    <div className="min-h-dvh bg-bg-soft">
      <header className="border-b-[3px] border-hb-blue bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="font-display text-xl text-hb-navy">블로그 분석 리포트</p>
            <p className="text-xs text-ink-soft">
              {daily[0].date.replaceAll("-", ".")} ~ {daily[daily.length - 1].date.replaceAll("-", ".")} · {UPDATED} 받은 통계
            </p>
          </div>
          <Link href="/studio" className="text-sm font-bold text-hb-navy underline">
            ← 블로그 스튜디오
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-sky-950 ring-1 ring-sky-200">
          <p className="min-w-0 flex-1">
            <b>실제 블로그 통계로 만든 리포트입니다.</b> 네이버 블로그 <b>내 블로그 통계</b>(조회수·유입분석·조회수 순위)와
            검색광고 <b>키워드 도구</b>에서 {UPDATED}에 내려받은 값이에요. 네이버가 자동 연결을 제공하지 않아, 새 통계를 받으면
            그때 갱신됩니다.
          </p>
          <span className="shrink-0 rounded-full bg-sky-200 px-3 py-1 text-xs font-bold">실제 데이터</span>
        </div>

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
          <h2 className="font-round text-lg">💡 분석 요약</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6">
            {insights.map((t) => (
              <li key={t} className="rounded-xl bg-white/10 px-4 py-2.5">
                {t}
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
                    {SOURCE_PERIODS.map((p) => (
                      <th key={p} className="pb-2 text-right font-normal whitespace-nowrap">
                        {p}
                      </th>
                    ))}
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
                        <td key={i} className="py-2 pl-2 text-right">
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
              방문 수가 적어(한 주 20~60회) 한 사람의 방문도 비율이 크게 움직입니다. 여러 주를 함께 보세요.
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
              받은 연관 검색어 377개 중 교육 관련은 위 정도이고, 나머지는 백운호수 맛집·카페·실버타운 검색이었습니다.
              &lsquo;백운호수&rsquo;(월 15,340회)는 크지만 대부분 맛집을 찾는 검색이라 학원 글과는 맞지 않아요.
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

        <section className="rounded-2xl border-2 border-dashed border-line bg-white p-5">
          <h2 className="font-round text-lg text-hb-navy">📥 더 받아 오면 정확해지는 데이터</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {WANTED.map((w) => (
              <li key={w.what} className="rounded-xl bg-bg-soft p-4 text-sm leading-6">
                <p className="font-bold">{w.what}</p>
                <p className="text-xs text-ink-soft">{w.where}</p>
                <p className="mt-1">{w.why}</p>
              </li>
            ))}
          </ul>
        </section>
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
