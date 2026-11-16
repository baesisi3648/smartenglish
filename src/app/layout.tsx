import type { Metadata } from "next";
import { Black_Han_Sans, Jua, Nanum_Gothic } from "next/font/google";
import { academy } from "@/content/academy";
import "./globals.css";

const display = Black_Han_Sans({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

const round = Jua({
  variable: "--font-round",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

const body = Nanum_Gothic({
  variable: "--font-body",
  weight: ["400", "700", "800"],
  subsets: ["latin"],
  preload: false,
});

// 카카오톡·SNS 공유 미리보기는 og:image 가 절대 주소여야 함 → 배포 주소를 기준 URL로
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const shareDescription = `${academy.tagline} · 초등 파닉스부터 중등 내신까지 1:1 맞춤 영어`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${academy.name} | 의왕·학의동 초등·중등 1:1 맞춤 영어`,
  description:
    "의왕 학의동 백운밸리 영어교습소. 초등 파닉스부터 중등 내신까지 레벨 진단 기반 1:1 맞춤 수업. 무료 레벨테스트·상담 예약.",
  openGraph: {
    title: academy.name,
    description: shareDescription,
    url: "/",
    siteName: academy.name,
    locale: "ko_KR",
    type: "website",
    // 카카오톡 공유 이미지 (1200×630, public/og.png)
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${academy.name} 로고` }],
  },
  twitter: { card: "summary_large_image", title: academy.name, description: shareDescription, images: ["/og.png"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${display.variable} ${round.variable} ${body.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
