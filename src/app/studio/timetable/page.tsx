import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { academy } from "@/content/academy";
import { passwordConfigured, verifySessionToken, SESSION_COOKIE } from "@/studio/auth";
import { studioEnabled } from "@/studio/guard";
import { getWeek, timetableConfigured } from "@/studio/timetable";
import { kstWeekday, weekStartOf } from "@/studio/week";
import TimetableClient from "./timetable-client";

export const metadata: Metadata = {
  title: "등원 시간표 | 스마트해법영어 백운밸리점",
  robots: { index: false, follow: false },
};

async function Timetable() {
  await connection(); // 로그인 확인·이번 주 계산은 요청마다
  if (!studioEnabled() || !passwordConfigured()) redirect("/studio");
  if (!verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/studio");

  if (!timetableConfigured()) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg-soft p-6 text-sm text-ink-soft">
        시간표 저장소(DB)가 연결되지 않았습니다. 관리자에게 알려 주세요.
      </main>
    );
  }
  const now = new Date();
  const thisWeek = weekStartOf(now);
  const initial = await getWeek(thisWeek);
  return (
    <TimetableClient
      initial={initial}
      thisWeek={thisWeek}
      todayWeekday={kstWeekday(now)}
      capacity={academy.tuition.value.capacity}
    />
  );
}

export default function TimetablePage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-bg-soft text-sm text-ink-soft">불러오는 중…</main>}>
      <Timetable />
    </Suspense>
  );
}
