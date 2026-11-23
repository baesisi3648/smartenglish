import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { verifySessionToken, SESSION_COOKIE } from "@/studio/auth";
import { academy } from "@/content/academy";
import PasteTest from "./paste-test";

export const metadata: Metadata = {
  title: "붙여넣기 시험 | 스튜디오",
  robots: { index: false, follow: false },
};

async function Gate() {
  await connection();
  if (!verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/studio");
  return <PasteTest placeUrl={academy.links.naverPlace} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-soft">불러오는 중…</p>}>
      <Gate />
    </Suspense>
  );
}
