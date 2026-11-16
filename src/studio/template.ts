import { academy } from "@/content/academy";
import type { Draft } from "./prompt";

/** 블로그 고정 태그 (기존 글에서 반복 사용) */
const BASE_TAGS = [
  "스마트해법영어백운밸리점",
  "스마트해법영어",
  "의왕영어",
  "의왕영어학원",
  "학의동영어",
  "학의동영어학원",
  "초등영어",
  "중등영어",
  "백운호수초등학교영어학원",
  "백운호수영어",
];

const INTRO = `안녕하세요\n${academy.name}입니다.`;

/** 연락처·주소는 SSOT에서만 가져온다 (LLM이 만들지 않음) */
function outro() {
  const a = academy.address;
  return [
    `" 감사합니다 "`,
    "",
    "",
    `📞교육상담문의`,
    academy.contact.mobile.display,
    "",
    `"${academy.contact.smsBody}"라는 문구로 문자 남겨주시면 빠른 시간 내 확인 후`,
    "바로 연락드리겠습니다.",
    "",
    `📍위치: ${a.road}`,
    `${a.detail.replace("해링턴플레이스1단지", "해링턴플레이스 1단지")}`,
    `(${a.landmark})`,
  ].join("\n");
}

export type FinalPost = {
  title: string;
  body: string;
  tags: string[];
  notes: string;
};

/** keywords[0] = 제목 괄호 키워드, 전체 키워드는 태그로도 추가 */
export function assemble(draft: Draft, keywords: string[]): FinalPost {
  const title = `${draft.title.replace(/\[[^\]]*\]\s*$/, "").trim()}[${keywords[0]}]`;
  const clean = draft.body
    .replace(/^안녕하세요[^\n]*\n?/m, "")
    .replace(/스마트해법영어 백운밸리점입니다\.?\n?/, "")
    .trim();
  const body = `${INTRO}\n\n${clean}\n\n\n${outro()}`;
  const norm = (t: string) => t.replace(/^#/, "").replace(/\s+/g, "");
  const kwTags = keywords.map(norm);
  const extra = draft.tags.map(norm).filter(Boolean);
  // 네이버 블로그 태그는 최대 30개 — 선택 키워드를 고정 태그보다 우선
  const tags = [...new Set([...kwTags, ...BASE_TAGS, ...extra])].slice(0, 30);
  return { title, body, tags, notes: draft.notes };
}
