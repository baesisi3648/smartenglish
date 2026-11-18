import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { availableAgents } from "@/studio/guard";
import { openaiServerKey } from "@/studio/openai-api";
import { passwordConfigured, verifySessionToken, SESSION_COOKIE } from "@/studio/auth";
import { POST_TYPES, KEYWORD_GROUPS } from "@/studio/post-types";
import StudioClient from "./studio-client";
import LoginForm from "./login-form";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "블로그 스튜디오 | 스마트해법영어 백운밸리점",
  robots: { index: false, follow: false },
};

const LOCAL_STUDIO_URL = "http://localhost:3456/studio";

function Center({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-bg-soft px-4 py-10">{children}</main>;
}

async function Gate() {
  if (!passwordConfigured()) {
    return (
      <Center>
        <div className="max-w-md rounded-2xl bg-white p-6 text-sm leading-6 ring-1 ring-line">
          <p className="font-bold text-hb-navy">관리자 비밀번호가 설정되지 않았습니다.</p>
          <p className="mt-2 text-ink-soft">
            <code>STUDIO_PASSWORD</code>(8자 이상)와 <code>STUDIO_SECRET</code>(32자 이상 무작위) 환경변수를 설정해
            주세요. PC는 <code>처음 설정.cmd</code>가 자동으로 만들고, 배포는 Vercel 환경변수입니다.
          </p>
        </div>
      </Center>
    );
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    return (
      <Center>
        <LoginForm />
      </Center>
    );
  }

  // 쓸 수 있는 AI가 없음(배포 사이트 + Gemini 키 없음) → 원장님 PC 스튜디오로 안내
  const agents = availableAgents();
  if (agents.length === 0) {
    return (
      <Center>
        <div className="max-w-md rounded-3xl border-2 border-hb-navy bg-white p-8 text-center shadow-[6px_6px_0_var(--hb-blue)]">
          <h1 className="font-display text-2xl text-hb-navy">블로그 스튜디오</h1>
          <p className="mt-3 text-[15px] leading-7 text-ink-soft">
            글 생성은 원장님 PC의 AI(ChatGPT·Claude)로 동작합니다.
            <br />
            바탕화면의 <b className="text-ink">&lsquo;블로그 스튜디오&rsquo;</b> 아이콘을 실행한 뒤 아래 버튼을 눌러
            주세요.
          </p>
          <a
            href={LOCAL_STUDIO_URL}
            className="mt-6 inline-block rounded-full bg-hb-navy px-6 py-3 font-extrabold text-white"
          >
            내 PC 스튜디오 열기
          </a>
          <form action={logout} className="mt-4">
            <button className="text-xs text-ink-soft underline">로그아웃</button>
          </form>
          <p className="mt-4 text-xs text-ink-soft">
            <Link href="/" className="underline">
              홈페이지로
            </Link>
          </p>
        </div>
      </Center>
    );
  }

  return (
    <StudioClient
      agents={agents.map(({ id, label, plan, loginHelp }) => ({ id, label, plan, loginHelp }))}
      postTypes={POST_TYPES}
      keywordGroups={KEYWORD_GROUPS}
      openaiServerKey={Boolean(openaiServerKey())}
      logout={logout}
    />
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <Center>
          <p className="text-sm text-ink-soft">불러오는 중…</p>
        </Center>
      }
    >
      <Gate />
    </Suspense>
  );
}
