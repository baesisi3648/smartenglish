import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { academy, smsHref } from "@/content/academy";
import { programs, startSteps as steps } from "@/content/programs";
import { getLatestPosts, splitTitle } from "@/lib/blog";

const { contact, address, links, hours } = academy;
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

/* 배너에서 잘라낸 일러스트 (public/brand) */
const art = {
  boy: { src: "/brand/boy.png", w: 144, h: 292 },
  girl: { src: "/brand/girl.png", w: 132, h: 281 },
  bookshelf: { src: "/brand/bookshelf.png", w: 122, h: 143 },
  papers: { src: "/brand/papers.png", w: 113, h: 120 },
  books: { src: "/brand/books.png", w: 79, h: 85 },
  redbook: { src: "/brand/redbook.png", w: 106, h: 79 },
  bulb: { src: "/brand/bulb.png", w: 26, h: 44 },
};

function Art({ name, className = "", scale = 1 }: { name: keyof typeof art; className?: string; scale?: number }) {
  const a = art[name];
  return (
    <Image
      src={a.src}
      width={Math.round(a.w * scale)}
      height={Math.round(a.h * scale)}
      alt=""
      aria-hidden
      className={`pointer-events-none select-none ${className}`}
    />
  );
}

/** 공식 로고 (원장님 제공 원본에서 글자 영역만 잘라 투명 배경 처리, 720×144) */
function BrandLogo({ height }: { height: number }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="스마트해법영어"
      width={720}
      height={144}
      priority
      style={{ height, width: "auto" }}
      className="select-none"
    />
  );
}

function Verify({ on }: { on?: boolean }) {
  if (!on) return null;
  return (
    <span className="ml-1.5 inline-block rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 align-middle font-sans text-[11px] font-bold text-amber-700">
      확인 필요
    </span>
  );
}

function BookingButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={links.naverBooking}
      {...ext}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-hb-navy px-7 py-3.5 font-extrabold text-white shadow-[0_4px_0_#00317a] transition hover:brightness-110 active:translate-y-[2px] active:shadow-none ${className}`}
    >
      <span className="grid size-5 place-items-center rounded-sm bg-hb-green text-[11px] font-black">N</span>
      무료 레벨테스트 예약
    </a>
  );
}

function SmsButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={smsHref}
      className={`inline-flex items-center justify-center gap-2 rounded-full border-2 border-hb-navy bg-white px-7 py-3 font-extrabold text-hb-navy transition hover:bg-bg-soft ${className}`}
    >
      문자로 상담 문의
    </a>
  );
}

function SectionTitle({ eyebrow, children, center }: { eyebrow: string; children: React.ReactNode; center?: boolean }) {
  return (
    <div className={center ? "text-center" : ""}>
      <p className="font-round text-lg text-hb-blue">{eyebrow}</p>
      <h2 className="mt-1 font-display text-3xl leading-tight text-hb-navy sm:text-[2.6rem]">{children}</h2>
    </div>
  );
}

/* ───────── Header ───────── */
function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2" aria-label={academy.name}>
          <BrandLogo height={24} />
          <span className="font-display text-lg text-hb-navy">백운밸리점</span>
        </a>
        <nav className="hidden gap-7 text-[15px] font-bold text-ink md:flex">
          <a href="#programs" className="hover:text-hb-blue">
            프로그램
          </a>
          <a href="#method" className="hover:text-hb-blue">
            수업 방식
          </a>
          <a href="#story" className="hover:text-hb-blue">
            해법 Story
          </a>
          <a href="#visit" className="hover:text-hb-blue">
            오시는 길
          </a>
        </nav>
        <a
          href={links.naverBooking}
          {...ext}
          className="rounded-full bg-hb-navy px-4 py-2 text-sm font-extrabold text-white hover:brightness-110"
        >
          상담 예약
        </a>
      </div>
    </header>
  );
}

/* ───────── Hero: 배너 구성을 홈페이지 레이아웃으로 ───────── */
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-b from-white to-bg-soft">
      <div className="frame mx-auto max-w-5xl px-6 pb-0 pt-12 sm:px-16 md:pt-16">
        <div className="relative z-10 text-center">
          <h1 className="font-display text-[2.3rem] leading-[1.15] text-hb-navy sm:text-6xl md:text-7xl">
            스마트해법영어
            <br className="sm:hidden" /> 백운밸리점
          </h1>
          <div className="mt-3 flex items-center justify-center">
            <Art name="bulb" className="bob" />
          </div>
          <p className="outline-text mt-2 font-display text-[1.9rem] tracking-wide sm:text-5xl">
            믿고 보내는 <span className="text-hb-yellow">교습소</span>
          </p>
          <p className="mt-5 font-round text-xl text-hb-blue sm:text-2xl">{academy.tagline}</p>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-ink-soft sm:text-base">
            레벨 진단으로 비어 있는 곳을 찾고, 1:1 맞춤 지도로 하나씩 채웁니다.
            <br className="hidden sm:block" /> 초등 파닉스부터 중등 내신까지, 아이에게 맞는 속도로.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BookingButton />
            <SmsButton />
          </div>
        </div>

        {/* 일러스트 무대 */}
        <div className="relative mt-10 h-[210px] sm:h-[300px]">
          <Art name="boy" className="absolute bottom-0 left-0 h-[200px] w-auto sm:left-4 sm:h-[292px]" />
          <Art name="books" className="absolute bottom-0 left-[92px] h-[58px] w-auto sm:left-[170px] sm:h-[85px]" />
          <Art name="bookshelf" className="absolute bottom-6 left-1/2 hidden -translate-x-[150%] sm:block" />
          <Art name="papers" className="absolute bottom-10 left-1/2 hidden translate-x-[60%] sm:block" />
          <Art name="redbook" className="absolute bottom-0 right-[86px] h-[54px] w-auto sm:right-[160px] sm:h-[79px]" />
          <Art name="girl" className="absolute bottom-0 right-0 h-[196px] w-auto sm:right-4 sm:h-[281px]" />
        </div>
      </div>

      {/* 연락 바 — 배너 하단 전화/위치 */}
      <div className="relative z-10 bg-hb-navy text-white">
        <div className="mx-auto grid max-w-5xl gap-3 px-6 py-5 font-round text-[17px] sm:grid-cols-3 sm:px-16">
          <a href={`tel:${contact.mobile.tel}`} className="flex items-center gap-3 hover:underline">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-hb-navy">☎</span>
            {contact.mobile.display}
          </a>
          <a href="#visit" className="flex items-center gap-3 hover:underline">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-hb-navy">📍</span>
            <span className="leading-tight">
              {address.detail.replace("해링턴플레이스1단지", "해링턴플레이스 1단지")}
              <span className="block text-sm text-white/70">({address.landmark})</span>
            </span>
          </a>
          <p className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-hb-navy">🕐</span>
            <span className="leading-tight">상담 {hours.consult}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────── 리뷰 키워드 ───────── */
function Reviews() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <SectionTitle eyebrow="학부모님 이야기" center>
        이런 점이 <span className="hl">좋았어요</span>
      </SectionTitle>
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {academy.reviewKeywords.items.map((k, i) => (
          <li
            key={k.label}
            className="relative rounded-3xl border-2 border-hb-navy bg-white px-6 py-7 text-center shadow-[5px_5px_0_var(--hb-blue)]"
          >
            <span className="text-3xl">{["📈", "✅", "🔥"][i]}</span>
            <p className="mt-2 text-lg font-extrabold">&ldquo;{k.label}&rdquo;</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs text-ink-soft">
        {academy.reviewKeywords.source} 기준 · {academy.reviewKeywords.asOf}
      </p>
    </section>
  );
}

/* ───────── 프로그램 ───────── */

function Programs() {
  return (
    <section id="programs" className="relative bg-bg-soft">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex items-end justify-between gap-6">
          <SectionTitle eyebrow="PROGRAM">학년과 수준에 맞는 과정</SectionTitle>
          <Art name="bookshelf" scale={0.8} className="hidden md:block" />
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {programs.map((p) => (
            <article key={p.tag} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-line">
              <div className={`${p.color} px-6 py-4 font-round text-xl text-white`}>{p.tag}</div>
              <div className="p-6">
                <h3 className="text-xl font-extrabold">{p.title}</h3>
                <ol className="mt-4 space-y-2">
                  {p.steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-[15px] font-bold">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-hb-yellow text-xs text-ink">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-[15px] leading-7 text-ink-soft">{p.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── 수업 방식 ───────── */
const method = [
  ["레벨 진단 기반 커리큘럼", "첫 상담에서 현재 실력을 진단하고, 그 아이에게 필요한 순서로 커리큘럼을 짭니다."],
  ["전 영역 약점 분석", "읽기·쓰기·문법·어휘 중 어디가 비어 있는지 확인하고 개별로 보완합니다."],
  ["성향과 속도에 맞춘 지도", "같은 교재라도 아이의 성향과 속도에 맞춰 진도와 설명 방식을 조절합니다."],
  ["수업 후 즉각 피드백", "그날 배운 내용은 그날 확인하고, 학부모님께도 학습 상황을 공유합니다."],
];

function Method() {
  return (
    <section id="method" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_1.3fr]">
        <div>
          <SectionTitle eyebrow="METHOD">
            1:1 맞춤은
            <br />
            <span className="hl">이렇게</span> 운영합니다
          </SectionTitle>
          <p className="mt-5 leading-7 text-ink-soft">
            &ldquo;어디서부터 어떻게 시작해야 할지 모르겠어요...&rdquo;
            <br />
            상담 때 가장 많이 듣는 말입니다. 약점은 정확하게 찾고, 잘하는 부분은 더 넓혀 갑니다.
          </p>
          <div className="mt-8 flex items-end gap-6">
            <Art name="papers" />
            <Art name="boy" scale={0.55} />
          </div>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2">
          {method.map(([t, d], i) => (
            <li key={t} className="rounded-3xl border border-line bg-white p-6">
              <p className="font-display text-3xl text-hb-blue">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-lg font-extrabold">✔️ {t}</h3>
              <p className="mt-2 text-[15px] leading-7 text-ink-soft">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────── 상담 절차 ───────── */

function Start() {
  return (
    <section id="start" className="bg-hb-navy text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="font-round text-lg text-hb-yellow">START</p>
        <h2 className="mt-1 font-display text-3xl sm:text-[2.6rem]">상담부터 첫 수업까지</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
              <p className="font-round text-hb-yellow">STEP {i + 1}</p>
              <p className="mt-1 text-lg font-extrabold">{t}</p>
              <p className="mt-2 text-sm leading-6 text-white/75">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href={links.naverBooking}
            {...ext}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-hb-yellow px-7 py-3.5 font-extrabold text-ink hover:brightness-105"
          >
            무료 레벨테스트 예약
          </a>
          <a
            href={smsHref}
            className="inline-flex items-center justify-center rounded-full border-2 border-white px-7 py-3 font-extrabold hover:bg-white/10"
          >
            문자 상담 {contact.mobile.display}
          </a>
        </div>
        <p className="mt-4 text-sm text-white/70">
          &ldquo;상담문의&rdquo;라고 문자 남겨주시면 수업 후 순서대로 연락드립니다.
        </p>
      </div>
    </section>
  );
}

/* ───────── 블로그 Story ───────── */
async function StoryGrid() {
  const posts = await getLatestPosts(8);
  if (posts.length === 0) {
    return (
      <p className="py-10 text-center text-ink-soft">
        최신 글은{" "}
        <a href={links.blog} {...ext} className="underline">
          네이버 블로그
        </a>
        에서 확인해 주세요.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
      {posts.map((p) => {
        const { main, tag } = splitTitle(p.title);
        return (
          <li key={p.link} className="h-full">
            {/* 카드 높이 고정: 태그 1줄 + 제목 2줄 자리를 항상 확보 */}
            <a
              href={p.link}
              {...ext}
              className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-line transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="aspect-[4/3] overflow-hidden bg-bg-soft">
                {p.thumbnail ? (
                  // 네이버 이미지 서버는 외부 리퍼러를 차단하므로 no-referrer 필수
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="size-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="grid size-full place-items-center font-display text-xl text-hb-blue/40">해법영어</div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3.5">
                <p className="h-4 truncate text-xs font-bold leading-4 text-hb-blue">{tag && `#${tag}`}</p>
                <p className="mt-1 line-clamp-2 h-[2.5rem] text-[14px] font-extrabold leading-5" title={main}>
                  {main}
                </p>
                <p className="mt-auto pt-1.5 text-xs text-ink-soft">{p.date}</p>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Story() {
  return (
    <section id="story" className="bg-bg-soft">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle eyebrow="해법 STORY">백운밸리 해법이들 이야기</SectionTitle>
          <a href={links.blog} {...ext} className="font-bold text-hb-navy underline underline-offset-4">
            블로그 전체 보기 →
          </a>
        </div>
        <div className="mt-10">
          <Suspense
            fallback={
              <ul className="grid grid-cols-2 gap-5 lg:grid-cols-4" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-white" />
                ))}
              </ul>
            }
          >
            <StoryGrid />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

/**
 * 교습비 요약: 학년(초등/중등) × 과정(파닉스/영어)별 최저 금액. 같은 과정에 금액이 여러 개면 "~"를 붙인다.
 * 예) 초등 파닉스 200,000원 / 초등 영어 220,000원~ / 중등 영어 250,000원~
 */
function tuitionSummary(groups: (typeof academy)["tuition"]["value"]["groups"]) {
  return groups.flatMap((g) => {
    const byCourse = new Map<string, number[]>();
    for (const r of g.rows) {
      const course = r.name.startsWith("영어") ? "영어" : r.name;
      byCourse.set(course, [...(byCourse.get(course) ?? []), r.fee]);
    }
    return [...byCourse].map(([course, fees]) => ({
      group: g.label,
      course,
      fee: Math.min(...fees),
      from: new Set(fees).size > 1,
    }));
  });
}

/* ───────── 오시는 길 · 교습비 ───────── */
function Visit() {
  const tuition = academy.tuition.value;
  return (
    <section id="visit" className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-2">
      <div>
        <SectionTitle eyebrow="VISIT">오시는 길</SectionTitle>
        <p className="mt-6 text-xl font-extrabold">{address.road}</p>
        <p className="mt-1 text-lg">
          {address.detail} <span className="text-ink-soft">({address.landmark})</span>
          <Verify on={address.verify} />
        </p>
        <p className="mt-5 rounded-2xl bg-bg-soft px-5 py-4 text-[15px]">🚗 {address.parking}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={links.naverPlace}
            {...ext}
            className="rounded-full bg-hb-green px-5 py-2.5 text-sm font-extrabold text-white hover:brightness-95"
          >
            네이버 지도에서 보기
          </a>
          <a
            href={`tel:${contact.phone.tel}`}
            className="rounded-full border-2 border-hb-navy px-5 py-2 text-sm font-extrabold text-hb-navy hover:bg-bg-soft"
          >
            전화 {contact.phone.display}
          </a>
        </div>
      </div>

      <div
        id="tuition"
        className="relative rounded-3xl border-2 border-hb-navy bg-white p-7 shadow-[6px_6px_0_var(--hb-blue)]"
      >
        <Art name="redbook" scale={0.8} className="absolute -right-3 -top-10 rotate-6" />
        <h2 className="font-display text-2xl text-hb-navy">
          교습비 안내
          <Verify on={academy.tuition.verify} />
        </h2>
        <table className="mt-5 w-full text-left">
          <thead className="border-b-2 border-line text-sm text-ink-soft">
            <tr>
              <th className="py-2 font-bold">구분</th>
              <th className="py-2 font-bold">과정</th>
              <th className="py-2 pr-4 text-right font-bold">교습비 (1달)</th>
            </tr>
          </thead>
          <tbody>
            {tuitionSummary(tuition.groups).map((t) => (
              <tr key={`${t.group}-${t.course}`} className="border-b border-line last:border-0">
                <td className="py-3 font-extrabold text-hb-navy">{t.group}</td>
                <td className="py-3">{t.course}</td>
                <td className="py-3 text-right text-lg font-extrabold tabular-nums">
                  {t.fee.toLocaleString("ko-KR")}원
                  {/* "~" 자리를 항상 같은 폭으로 비워 둬서 금액 끝이 한 줄로 정렬되게 */}
                  <span className="inline-block w-4 text-left" aria-hidden={!t.from}>
                    {t.from ? "~" : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 rounded-xl bg-bg-soft px-4 py-2 text-sm font-bold text-hb-navy">{tuition.discount}</p>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          반·수업 시간에 따라 다르며, 관할 교육지원청에 신고된 교습비({tuition.filedAt}) 기준입니다.
        </p>
      </div>
    </section>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: academy.name,
  telephone: contact.phone.display,
  address: {
    "@type": "PostalAddress",
    streetAddress: `${address.road} ${address.detail}`,
    addressLocality: "의왕시",
    addressRegion: "경기도",
    addressCountry: "KR",
  },
  geo: { "@type": "GeoCoordinates", latitude: address.geo.lat, longitude: address.geo.lng },
  sameAs: [links.blog, links.instagram, links.naverPlace],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Header />
      <main>
        <Hero />
        <Reviews />
        <Programs />
        <Method />
        <Start />
        <Story />
        <Visit />
      </main>

      {/* Footer — 학원법 표시사항 */}
      <footer className="border-t-[3px] border-hb-blue bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
          <div className="text-[13px] leading-6 text-ink-soft">
            <BrandLogo height={30} />
            <p className="mt-2 font-display text-base text-hb-navy">{academy.name}</p>
            <p>
              {academy.type} 신고번호 {academy.registration.value}
              <Verify on={academy.registration.verify} /> · 교습과목 {academy.subject.value}
              <Verify on={academy.subject.verify} />
            </p>
            <p>
              {address.road} {address.detail} ({address.landmark})
            </p>
            <p>
              대표전화 {contact.phone.display} · 문자상담 {contact.mobile.display} · 상담 {hours.consult}
            </p>
          </div>
          <div className="flex gap-4 text-sm font-bold text-hb-navy">
            <a href={links.blog} {...ext} className="hover:underline">
              블로그
            </a>
            <a href={links.instagram} {...ext} className="hover:underline">
              인스타그램
            </a>
            <a href={links.talktalk} {...ext} className="hover:underline">
              톡톡
            </a>
            <Link href="/studio" prefetch={false} className="font-normal text-ink-soft/70 hover:underline">
              관리자
            </Link>
          </div>
        </div>
      </footer>

      {/* 모바일 하단 고정 CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <a
          href={smsHref}
          className="rounded-full border-2 border-hb-navy py-2.5 text-center text-sm font-extrabold text-hb-navy"
        >
          문자 상담
        </a>
        <a
          href={links.naverBooking}
          {...ext}
          className="rounded-full bg-hb-navy py-2.5 text-center text-sm font-extrabold text-white"
        >
          레벨테스트 예약
        </a>
      </div>
      <div className="h-16 md:hidden" aria-hidden />
    </>
  );
}
