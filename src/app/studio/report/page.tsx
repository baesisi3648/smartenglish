import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getLatestPosts } from "@/lib/blog";
import { passwordConfigured, verifySessionToken, SESSION_COOKIE } from "@/studio/auth";
import { studioEnabled } from "@/studio/guard";
import { todayKst } from "@/studio/planner";
import { POST_TYPES } from "@/studio/post-types";
import { buildMockReport } from "@/studio/report-mock";
import { BarList, DailyChart, Heatmap } from "./charts";

export const metadata: Metadata = {
  title: "블로그 분석 리포트 | 스마트해법영어 백운밸리점",
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

function Delta({ now, prev }: { now: number; prev: number }) {
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span className={`text-xs font-bold ${up ? "text-emerald-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-ink-soft">지난 30일 대비</span>
    </span>
  );
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-5 ring-1 ring-line ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="font-round text-lg text-hb-navy">{title}</h2>
        {sub && <p className="text-xs text-ink-soft">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

async function Report() {
  await connection(); // 로그인 확인·오늘 날짜는 요청마다 계산 (미리 렌더링 금지)
  if (!studioEnabled() || !passwordConfigured()) redirect("/studio");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) redirect("/studio");

  const posts = await getLatestPosts(10);
  const r = buildMockReport(todayKst(), posts);
  const k = r.kpi;
  const typeLabel = (id: string) => POST_TYPES.find((t) => t.id === id);

  const tiles = [
    { label: "방문자", value: `${fmt(k.visitors)}명`, delta: <Delta now={k.visitors} prev={k.visitorsPrev} /> },
    { label: "조회수", value: `${fmt(k.views)}회`, delta: <Delta now={k.views} prev={k.viewsPrev} /> },
    { label: "하루 평균 방문자", value: `${fmt(k.avgDaily)}명`, delta: <span className="text-xs text-ink-soft">글 {k.posts}편 발행</span> },
    {
      label: "공감 · 댓글",
      value: `${fmt(k.likes)} · ${fmt(k.comments)}`,
      delta: <span className="text-xs text-ink-soft">새 이웃 +{k.newNeighbors}명</span>,
    },
  ];

  return (
    <div className="min-h-dvh bg-bg-soft">
      <header className="border-b-[3px] border-hb-blue bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="font-display text-xl text-hb-navy">블로그 분석 리포트</p>
            <p className="text-xs text-ink-soft">
              최근 30일 · {r.period.from} ~ {r.period.to}
            </p>
          </div>
          <Link href="/studio" className="text-sm font-bold text-hb-navy underline">
            ← 블로그 스튜디오
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
          <p>
            <b>예시 데이터로 만든 화면입니다.</b> 네이버 블로그 통계는 자동으로 불러올 수 없어서, 지금 숫자는 화면 구성을
            보여 주기 위한 예시예요. 실제 통계는 아래 &lsquo;통계 캡처 올리기&rsquo;로 채울 예정입니다.
          </p>
          <span className="shrink-0 rounded-full bg-amber-200 px-3 py-1 text-xs font-bold">예시 데이터</span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <p className="text-xs font-bold text-ink-soft">{t.label}</p>
              <p className="mt-1 font-display text-2xl text-ink sm:text-3xl">{t.value}</p>
              <div className="mt-1">{t.delta}</div>
            </div>
          ))}
        </div>

        <Panel title="일별 방문자" sub="● 글 올린 날">
          <DailyChart data={r.daily} />
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-ink-soft">표로 보기</summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="sticky top-0 bg-white text-ink-soft">
                  <tr>
                    <th className="py-1">날짜</th>
                    <th>방문자</th>
                    <th>조회수</th>
                    <th>글</th>
                  </tr>
                </thead>
                <tbody>
                  {r.daily.map((d) => (
                    <tr key={d.date} className="border-t border-line">
                      <td className="py-1">{d.label}</td>
                      <td>{fmt(d.visitors)}</td>
                      <td>{fmt(d.views)}</td>
                      <td>{d.posted ? "●" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>

        <section className="rounded-2xl bg-hb-navy p-5 text-white">
          <h2 className="font-round text-lg">💡 AI 분석 요약</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6">
            {r.insights.map((t) => (
              <li key={t} className="rounded-xl bg-white/10 px-4 py-2.5">
                {t}
              </li>
            ))}
          </ul>
          <Link
            href="/studio"
            className="mt-4 inline-block rounded-full bg-hb-yellow px-5 py-2.5 text-sm font-extrabold text-ink"
          >
            이 분석으로 다음 글 쓰러 가기 →
          </Link>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="어디서 들어왔나요" sub="유입 경로 비율">
            <BarList items={r.sources} unit="%" percent />
          </Panel>
          <Panel title="어떤 검색어로 왔나요" sub="유입 검색어 TOP 8">
            <BarList items={r.keywords} unit="회" />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Panel title="많이 본 글" sub="조회수 TOP 5">
            <ol className="divide-y divide-line">
              {r.topPosts.map((p, i) => {
                const t = typeLabel(p.type);
                return (
                  <li key={p.title} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-soft text-xs font-bold text-hb-navy">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {p.link ? (
                        <a href={p.link} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-bold hover:underline">
                          {p.title}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-bold">{p.title}</p>
                      )}
                      <p className="text-xs text-ink-soft">
                        {t?.emoji} {t?.label}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {fmt(p.views)}
                      <span className="ml-0.5 text-xs font-normal text-ink-soft">회</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Panel>
          <Panel title="글 유형별 반응" sub="유형별 평균 조회수">
            <BarList
              items={r.byType.map((t) => ({ label: `${t.emoji} ${t.label} (${t.posts}편)`, value: t.avgViews }))}
              unit="회"
            />
          </Panel>
        </div>

        <Panel title="언제 많이 볼까요" sub="요일 × 시간대 평균 조회수">
          <Heatmap {...r.heatmap} />
        </Panel>

        <section className="rounded-2xl border-2 border-dashed border-line bg-white p-5">
          <h2 className="font-round text-lg text-hb-navy">📷 통계 캡처 올리기 (준비 중)</h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            네이버 블로그 앱·PC의 <b>내 블로그 통계</b> 화면(방문 분석, 유입 분석, 조회수 순위)을 캡처해 올리면 AI가 숫자를
            읽어 이 리포트를 실제 데이터로 채웁니다. 매달 한 번 올리면 지난달과 비교할 수 있어요.
          </p>
          <button
            type="button"
            disabled
            className="mt-3 cursor-not-allowed rounded-full bg-line px-5 py-2.5 text-sm font-bold text-ink-soft"
          >
            캡처 올리기 — 곧 열립니다
          </button>
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
