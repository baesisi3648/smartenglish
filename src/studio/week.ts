/** 등원 시간표의 주(週) 계산 — 서버·화면 공통 (한국 시간 기준, 주는 월요일부터) */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 한국 날짜 기준 그 주 월요일 (YYYY-MM-DD). 주말이면 다음 주 월요일 */
export function weekStartOf(d: Date) {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const day = kst.getUTCDay(); // 0=일
  const diff = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + diff)).toISOString().slice(0, 10);
}

/** 한국 시간 오늘 요일 (1=월 … 5=금, 주말 0) */
export function kstWeekday(d: Date) {
  const day = new Date(d.getTime() + 9 * 3600_000).getUTCDay();
  return day >= 1 && day <= 5 ? day : 0;
}

/** 아무 날짜나 그 주 월요일로 (형식이 틀리면 이번 주) */
export function normalizeWeek(v: unknown): string {
  if (typeof v === "string" && DATE.test(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      const day = d.getUTCDay();
      const back = day === 0 ? 6 : day - 1;
      return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    }
  }
  return weekStartOf(new Date());
}
