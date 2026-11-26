import type { Weekday } from "@/studio/timetable";

/** 한 번에 등록할 수 있는 학생 수 (서버 MAX_BULK 와 같게) */
export const MAX_BULK_ROWS = 60;

/**
 * 여러 명 한 번에 등록: 한 줄에 한 명 — "홍길동 월2 화2 목4:20 금3(1:40)"
 * - 요일 + 수업 시각(1~9시는 오후로 봄), 괄호 = 실제 도착 시각 (종이 시간표처럼)
 */
const DAY_INDEX: Record<string, Weekday> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5 };
const toTime = (h: number, m: number) => {
  if (h >= 1 && h <= 9) h += 12;
  // 학원 시각(오전 8시 ~ 오후 10시)만 — 서버와 같은 범위 (벗어나면 미리보기에서 빠져 보임)
  return h < 8 || h > 22 || m > 59 ? null : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export type BulkRow = { name: string; slots: { weekday: Weekday; time: string; arrive: string | null }[] };

export function parseBulk(text: string): BulkRow[] {
  const out: BulkRow[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const first = line.search(/[월화수목금]\s*\d/);
    const name = (first >= 0 ? line.slice(0, first) : line).replace(/[,\s]+$/, "").trim().slice(0, 20);
    if (!name) continue;
    const slots: BulkRow["slots"] = [];
    const re = /([월화수목금])\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?\s*(?:분)?\s*시?\s*(?:\(\s*(\d{1,2})\s*:\s*(\d{2})\s*\))?/g;
    for (const m of line.matchAll(re)) {
      const time = toTime(Number(m[2]), Number(m[3] ?? 0));
      if (!time) continue;
      const arrive = m[4] ? toTime(Number(m[4]), Number(m[5])) : null;
      const weekday = DAY_INDEX[m[1]];
      if (!slots.some((x) => x.weekday === weekday)) slots.push({ weekday, time, arrive });
    }
    out.push({ name, slots });
  }
  return out;
}
