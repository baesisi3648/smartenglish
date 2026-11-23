import type { Weekday } from "@/studio/timetable";

/** 한 번에 등록할 수 있는 학생 수 (서버 MAX_BULK 와 같게) */
export const MAX_BULK_ROWS = 60;

/* 여러 명 한 번에 등록: "홍길동 월2 화2 목4:20" (1~9시는 오후로 봄) */
const DAY_INDEX: Record<string, Weekday> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5 };
export function parseBulk(text: string) {
  const out: { name: string; slots: { weekday: Weekday; time: string }[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const re = /([월화수목금])\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?\s*(?:분)?\s*시?/g;
    const first = line.search(/[월화수목금]\s*\d/);
    const name = (first >= 0 ? line.slice(0, first) : line).replace(/[,\s]+$/, "").trim().slice(0, 20);
    if (!name) continue;
    const slots: { weekday: Weekday; time: string }[] = [];
    for (const m of line.matchAll(re)) {
      let h = Number(m[2]);
      const min = Number(m[3] ?? 0);
      if (h >= 1 && h <= 9) h += 12;
      if (h > 23 || min > 59) continue;
      const weekday = DAY_INDEX[m[1]];
      if (!slots.some((x) => x.weekday === weekday)) slots.push({ weekday, time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` });
    }
    out.push({ name, slots });
  }
  return out;
}

