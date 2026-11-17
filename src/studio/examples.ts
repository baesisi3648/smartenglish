import "server-only";
import { cacheLife } from "next/cache";
import { academy } from "@/content/academy";
import { getLatestPosts } from "@/lib/blog";
import { TYPE_HINTS } from "./post-types";

/**
 * 퓨샷 문체 예시: 원장님 블로그의 최근 실제 글을 글 유형별로 골라 프롬프트에 붙인다.
 * - 모델을 학습시키는 것이 아니라, 매번 "이런 글처럼 써 달라"는 예시를 함께 보낸다.
 * - 새 글을 올리면 예시도 자동으로 최신 글로 바뀐다 (1시간 캐시).
 * - 예시 속 사실이 새 글에 섞이지 않도록: 숫자는 ○로 가리고, 인사·끝인사·연락처 부분은 잘라낸다.
 * - 가져오기에 실패하면 빈 배열 → 프롬프트의 고정 예시를 쓴다.
 */

const MAX_EXAMPLES = 2;
const MAX_CHARS = 1100;

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
  // 끝인사·연락처 이후 잘라냄
  const end = lines.findIndex((l) => /감사합니다|문의|상담|0507|010-|오시는 길|주소/.test(l));
  if (end > 3) lines = lines.slice(0, end);
  // 연속 빈 줄 정리
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // 숫자 가리기 (점수·학년·날짜·인원 등 사실이 새 글로 옮겨 가지 않게)
  const masked = text.replace(/\d+/g, "○");
  return masked.length > MAX_CHARS ? `${masked.slice(0, MAX_CHARS).replace(/\n[^\n]*$/, "")}\n(…이하 생략)` : masked;
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

  try {
    const posts = await getLatestPosts(30);
    const hint = TYPE_HINTS[typeId];
    const matched = hint ? posts.filter((p) => hint.test(`${p.title} ${p.category ?? ""}`)) : [];
    // 같은 유형 글 우선, 모자라면 최신 글로 채움
    const picked = [...matched, ...posts.filter((p) => !matched.includes(p))].slice(0, MAX_EXAMPLES + 2);

    const out: string[] = [];
    for (const p of picked) {
      if (out.length >= MAX_EXAMPLES) break;
      const paras = await fetchPostBody(p.link).catch(() => []);
      if (paras.length < 5) continue;
      const ex = cleanExample(p.title, paras);
      if (ex.length > 200) out.push(ex);
    }
    return out;
  } catch {
    return [];
  }
}
