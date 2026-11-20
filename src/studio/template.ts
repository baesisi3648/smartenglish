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

/** 제목 끝 괄호 키워드를 지정 키워드로 맞춤 (AI가 붙인 괄호는 떼어 냄) */
export function withKeyword(title: string, keyword: string) {
  const base = title.replace(/\[[^\]]*\]\s*$/, "").trim();
  return keyword ? `${base}[${keyword}]` : base;
}

/** AI 본문 → 인사말 + 본문 + 끝인사·연락처 (인사·연락처는 AI가 아니라 SSOT에서) */
export function wrapBody(core: string) {
  // AI가 인사말을 넣었으면 맨 앞에 있을 때만 뗀다 (본문 중간 문장은 건드리지 않음)
  const clean = core
    .trim()
    .replace(/^안녕하세요[^\n]*\n+/, "")
    .replace(/^스마트해법영어 백운밸리점입니다\.?[^\n]*\n*/, "")
    .trim();
  return `${INTRO}\n\n${clean}\n\n\n${outro()}`;
}

/** 완성 글 → AI가 쓴 본문 부분만 (수정 요청 때 인사·연락처는 빼고 보낸다) */
export function coreBody(full: string) {
  let text = full.replace(/\r/g, "");
  if (text.startsWith(INTRO)) text = text.slice(INTRO.length);
  // 끝인사는 시스템이 맨 뒤에 붙이므로 마지막 것에서 자른다 (본문 중간에 같은 문구가 있어도 유지)
  const end = text.lastIndexOf(`" 감사합니다 "`);
  if (end >= 0) text = text.slice(0, end);
  return text.trim();
}

/** keywords[0] = 제목 괄호 키워드, 전체 키워드는 태그로도 추가 */
export function assemble(draft: Draft, keywords: string[]): FinalPost {
  const title = withKeyword(draft.title, keywords[0]);
  const body = wrapBody(draft.body);
  const norm = (t: string) => t.replace(/^#/, "").replace(/\s+/g, "");
  const kwTags = keywords.map(norm);
  const extra = draft.tags.map(norm).filter(Boolean);
  // 네이버 블로그 태그는 최대 30개 — 선택 키워드를 고정 태그보다 우선
  const tags = [...new Set([...kwTags, ...BASE_TAGS, ...extra])].slice(0, 30);
  return { title, body, tags, notes: draft.notes };
}
