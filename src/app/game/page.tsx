import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { academy } from "@/content/academy";
import TrapGame from "./trap-game";

export const metadata: Metadata = {
  title: `단어 사파리 — 1분 영어 게임 | ${academy.name}`,
  description: "덫을 피해 오아시스까지! 파닉스·초등·중등 레벨별 영어 단어 퀴즈 게임. 설치 없이 바로 플레이.",
};

/** 홈페이지 영어 놀이터 — 원본: gamify-class 애니멀 트랩 규칙을 1인 미니판으로 */
export default function GamePage() {
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#d9f0ff_0%,#fff8e6_38%,#fbefd0_100%)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" aria-label={`${academy.name} 홈페이지`}>
          <Image src="/brand/logo.png" alt={academy.name} width={720} height={144} className="h-6 w-auto" priority />
        </Link>
        <Link href="/" className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-bold text-hb-navy ring-1 ring-[#e9d8ac]">
          ← 홈페이지
        </Link>
      </header>
      <main>
        <TrapGame bookingUrl={academy.links.naverBooking} />
      </main>
    </div>
  );
}
