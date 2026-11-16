import { cacheLife } from "next/cache";
import { academy } from "@/content/academy";

export type BlogPost = {
  title: string;
  link: string;
  date: string;
  category?: string;
  excerpt?: string;
  /** blogthumb.pstatic.net — referrerPolicy="no-referrer" 로만 로드됨 */
  thumbnail?: string;
};

function pick(item: string, tag: string) {
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? decode(m[1].trim()) : "";
}

function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 네이버 블로그 RSS에서 최신 글을 가져온다. 실패 시 빈 배열. */
export async function getLatestPosts(limit = 6): Promise<BlogPost[]> {
  "use cache";
  cacheLife("hours");

  try {
    const res = await fetch(academy.links.blogRss, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    return items.slice(0, limit).map((it) => {
      const d = new Date(pick(it, "pubDate"));
      const desc = pick(it, "description");
      const thumb = desc.match(/https:\/\/blogthumb\.pstatic\.net\/[^"'\s<>]+/)?.[0];
      return {
        thumbnail: thumb ? thumb.split("?")[0] + "?type=s3" : undefined,
        excerpt: desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
        title: pick(it, "title"),
        link: pick(it, "link").split("?")[0],
        category: pick(it, "category") || undefined,
        date: isNaN(d.getTime())
          ? ""
          : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
      };
    });
  } catch {
    return [];
  }
}

/** "왜 지금 영어 기초가 중요할까요[초등 중등 영어]" → { main, tag } */
export function splitTitle(title: string) {
  const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { main: title, tag: "" };
  return { main: (m[1] || m[3]).trim(), tag: m[2] };
}
