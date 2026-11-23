import Link from "next/link";

/** 스튜디오 공통 머리글: 제목 + 화면 탭 (블로그 글쓰기 · 등원 시간표 · 분석 리포트) */
const TABS = [
  { id: "blog", href: "/studio", label: "✍️ 블로그 글쓰기" },
  { id: "timetable", href: "/studio/timetable", label: "📅 등원 시간표" },
  { id: "report", href: "/studio/report", label: "📊 분석 리포트" },
] as const;

export type StudioTab = (typeof TABS)[number]["id"];

export default function StudioHeader({ active, wide, children }: { active: StudioTab; wide?: boolean; children?: React.ReactNode }) {
  return (
    <header className="no-print border-b-[3px] border-hb-blue bg-white">
      <div className={`mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/studio" className="font-display text-xl text-hb-navy">
            스튜디오
          </Link>
          <nav aria-label="스튜디오 메뉴" className="flex flex-wrap gap-1 rounded-full bg-bg-soft p-1 text-sm font-bold">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={t.id === active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 ${t.id === active ? "bg-hb-navy text-white" : "text-hb-navy hover:bg-white"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        {children && <div className="flex items-center gap-4 text-sm font-bold text-hb-navy">{children}</div>}
      </div>
    </header>
  );
}
