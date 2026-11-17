import "server-only";
import { cacheLife } from "next/cache";
import { academy } from "@/content/academy";
import { getLatestPosts } from "@/lib/blog";
import { TYPE_HINTS } from "./post-types";
import { referenceFor } from "./reference-posts";

/**
 * 퓨샷 문체 예시 2편을 프롬프트에 붙인다 (모델 학습이 아니라 매번 "이런 글처럼"을 보여 주는 방식).
 * 1) 고정 예시: 원장님이 고른 대표 글 중 이 유형에 맞는 1편 (reference-posts.ts) — 구성·길이의 기준
 * 2) 최신 예시: 블로그 RSS의 같은 유형 최근 글 1편 — 새 글을 올리면 자동으로 바뀜 (1시간 캐시)
 * 예시 속 사실이 새 글에 섞이지 않도록 숫자는 ○로 가리고(목차 번호·1:1은 유지), 인사·끝인사·연락처는 잘라 낸다.
 */

const MAX_CHARS = 1800;

/** 점수·연도·학년·인원 같은 숫자 사실만 가린다. 줄 앞 목차 번호("1. ")와 "1:1 맞춤"은 글 구성이라 남긴다 */
export function maskFacts(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const lead = line.match(/^\d{1,2}\.\s/)?.[0] ?? "";
      const rest = line
        .slice(lead.length)
        .replace(/1:1/g, "\u0000")
        .replace(/\d+/g, "○")
        .replace(/\u0000/g, "1:1");
      return lead + rest;
    })
    .join("\n");
}

const clip = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS).replace(/\n[^\n]*$/, "")}\n(…이하 생략)` : s);

/** 모바일 글 페이지에서 본문 문단만 추출 (빈 문단 = 빈 줄 유지) */
function extractBody(html: string) {
  const paras = [...html.matchAll(/<p class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/​/g, "")
      .trim(),
  );
  return paras;
}

function cleanExample(title: string, paras: string[]) {
  let lines = [...paras];
  // 첫 줄이 제목이면 제거
  if (lines[0] && title.startsWith(lines[0].slice(0, 10))) lines.shift();
  // 인사말 제거 (시스템이 붙임)
  while (lines.length && (lines[0] === "" || /^안녕하세요|스마트해법영어\s*백운밸리점입니다/.test(lines[0]))) lines.shift();
  // 끝인사·연락처 이후 잘라냄 ("상담" 같은 단어는 본문 중간에도 나오므로 끝인사·연락처 표시만 본다)
  const end = lines.findIndex((l) => /감사합니다|📞|0507-|010-|오시는 길|위치\s*:/.test(l));
  if (end > 3) lines = lines.slice(0, end);
  // 연속 빈 줄 정리
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clip(maskFacts(text));
}

async function fetchPostBody(link: string) {
  const logNo = link.match(/(\d{9,})/)?.[1];
  const blogId = new URL(academy.links.blog).pathname.replace(/\//g, "");
  if (!logNo) return [];
  const res = await fetch(`https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  return extractBody(await res.text());
}

export async function getStyleExamples(typeId: string): Promise<string[]> {
  "use cache";
  cacheLife("hours");

  const ref = referenceFor(typeId);
  const fixed = clip(maskFacts(ref.body));
  try {
    const posts = await getLatestPosts(30);
    const hint = TYPE_HINTS[typeId];
    const sameAsRef = (title: string) => title.replace(/\s/g, "").startsWith(ref.title.replace(/\s/g, "").slice(0, 12));
    const pool = posts.filter((p) => !sameAsRef(p.title));
    const matched = hint ? pool.filter((p) => hint.test(`${p.title} ${p.category ?? ""}`)) : [];
    // 같은 유형 최근 글 우선, 없으면 가장 최근 글
    const picked = [...matched, ...pool.filter((p) => !matched.includes(p))].slice(0, 3);

    for (const p of picked) {
      const paras = await fetchPostBody(p.link).catch(() => []);
      if (paras.length < 5) continue;
      const ex = cleanExample(p.title, paras);
      if (ex.length > 200) return [fixed, ex];
    }
  } catch {
    /* 최신 글을 못 가져오면 고정 예시만 */
  }
  return [fixed];
}
