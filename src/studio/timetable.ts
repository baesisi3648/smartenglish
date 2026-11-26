import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { normalizeWeek, weekStartOf } from "./week";

export { normalizeWeek, weekStartOf };

/**
 * 등원 시간표 (Neon Postgres, Vercel Storage로 연결 — DATABASE_URL).
 * - tt_students: 학생 (이름·메모). 지우면 active=false (기록 보존)
 * - tt_regular: 평소 등원 — 요일(1=월 … 5=금)과 수업 시각("HH:MM", 시간표 칸), 학생·요일당 하나
 *     arrive: 수업 시각과 다르게 실제로 오는 시각 (종이 시간표의 괄호, 예: 3시 수업인데 1:40 도착)
 * - tt_overrides: 이번 주만 바뀐 것 — 그 주 월요일 + 요일 + 시각(null = 그날 쉼)
 *     평소 등원이 있는 요일: 시각 = 시간 변경, null = 쉼 / 평소 등원이 없는 요일: 시각 = 추가 등원
 *     from_weekday: 다른 요일에서 옮겨 온 등원이면 원래 요일 (되돌리기 때 두 칸을 함께 되돌림)
 * - tt_settings: 화면 설정 (시간 칸 목록)
 * - tt_students.duration: 학생별 수업시간(분, 없으면 null) — 출결과는 별개
 * - tt_attend: '출석!' 기록 — 하루에 한 번, 누른 시각(한국 시간). 끝나기 10분 전 알림의 기준
 * 한 번의 변경(옮기기 등)에 필요한 쓰기는 모두 한 트랜잭션으로 저장한다 (중간에 실패해도 반쪽 저장 없음).
 * 아이들 실명이 들어가므로 비밀번호로 보호된 스튜디오에서만 쓰고, 코드·커밋에는 이름을 넣지 않는다.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5;
export type Student = { id: number; name: string; note: string; duration: number | null };
export type Slot = { studentId: number; weekday: Weekday; time: string; arrive: string | null };
export type Override = { studentId: number; weekday: Weekday; time: string | null; arrive: string | null; fromWeekday: Weekday | null };
/** 출석 기록: day = 날짜(YYYY-MM-DD), at = 누른 시각("HH:MM", 한국 시간) */
export type Attend = { studentId: number; day: string; at: string };
export type WeekData = { week: string; students: Student[]; regular: Slot[]; overrides: Override[]; rows: string[]; attend: Attend[] };

/** 시간표 왼쪽 시간 칸 기본값: 1시~7시 */
export const DEFAULT_ROWS = ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
export const MAX_ROWS = 16;
export const MAX_STUDENTS = 200;
export const MAX_BULK = 60;

/** 화면에 그대로 보여 줄 수 있는 업무 오류 (예: 그 요일에 이미 등원이 있음) */
export class TimetableError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

let _sql: NeonQueryFunction<false, false> | null = null;
function db() {
  // 빌드 때 모듈을 읽어도 터지지 않게, 처음 쓸 때 연결
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
    _sql = neon(url);
  }
  return _sql;
}

export function timetableConfigured() {
  return !!process.env.DATABASE_URL;
}

let ready: Promise<void> | null = null;
function ensureSchema() {
  ready ??= (async () => {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS tt_students (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS tt_regular (
      student_id INT NOT NULL REFERENCES tt_students(id) ON DELETE CASCADE,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 5),
      time TEXT NOT NULL,
      PRIMARY KEY (student_id, weekday)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS tt_overrides (
      student_id INT NOT NULL REFERENCES tt_students(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 5),
      time TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (student_id, week_start, weekday)
    )`;
    await sql`ALTER TABLE tt_overrides ADD COLUMN IF NOT EXISTS from_weekday SMALLINT`;
    await sql`ALTER TABLE tt_overrides ADD COLUMN IF NOT EXISTS arrive TEXT`;
    await sql`ALTER TABLE tt_regular ADD COLUMN IF NOT EXISTS arrive TEXT`;
    await sql`CREATE TABLE IF NOT EXISTS tt_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL)`;
    await sql`ALTER TABLE tt_students ADD COLUMN IF NOT EXISTS duration SMALLINT`;
    await sql`CREATE TABLE IF NOT EXISTS tt_attend (
      student_id INT NOT NULL REFERENCES tt_students(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (student_id, day)
    )`;
  })().catch((e) => {
    ready = null; // 다음 요청에서 다시 시도
    throw e;
  });
  return ready;
}

/* ─────────── 입력 검사 ─────────── */

/**
 * 학원 시각만 받는다: 오전 8시 ~ 오후 10시 59분.
 * (오전/오후를 잘못 골라 "03:00"처럼 새벽 시각이 들어가면 화면에선 3:00으로 보이는데 엉뚱한 칸에 들어가는 문제가 있었음)
 */
const TIME = /^(0[89]|1\d|2[0-2]):[0-5]\d$/;
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
/** 읽을 때는 형식만 본다 (예전에 저장된 칸이 범위 밖이어도 시간표 설정 전체가 기본값으로 바뀌지 않게) */
const isClock = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const isWeekday = (v: unknown): v is Weekday => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;
export const cleanName = (v: unknown) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
export const MAX_NOTE = 200;
export const cleanNote = (v: unknown) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, MAX_NOTE);
/** 수업시간(분): 10분 단위 10분~5시간, 비우면 null. 형식이 틀리면 undefined */
export const cleanDuration = (v: unknown): number | null | undefined =>
  v == null || v === "" ? null : Number.isInteger(v) && (v as number) >= 10 && (v as number) <= 300 && (v as number) % 10 === 0 ? (v as number) : undefined;
const DAY = ["", "월", "화", "수", "목", "금"];
const short = (t: string) => `${Number(t.slice(0, 2)) > 12 ? Number(t.slice(0, 2)) - 12 : Number(t.slice(0, 2))}:${t.slice(3)}`;

/* ─────────── 읽기 ─────────── */

export async function getWeek(week: string): Promise<WeekData> {
  await ensureSchema();
  const sql = db();
  const [students, regular, overrides, settings, attend] = await Promise.all([
    sql`SELECT id, name, note, duration FROM tt_students WHERE active ORDER BY name`,
    sql`SELECT r.student_id, r.weekday, r.time, r.arrive FROM tt_regular r JOIN tt_students s ON s.id = r.student_id WHERE s.active`,
    sql`SELECT o.student_id, o.weekday, o.time, o.arrive, o.from_weekday FROM tt_overrides o JOIN tt_students s ON s.id = o.student_id
        WHERE s.active AND o.week_start = ${week}`,
    sql`SELECT value FROM tt_settings WHERE key = 'rows'`,
    // 그 주(월~금) 출석 + 오늘 출석 (다른 주를 보고 있어도 오늘 알림은 울리게)
    sql`SELECT a.student_id, to_char(a.day, 'YYYY-MM-DD') AS day, to_char(a.at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS at
        FROM tt_attend a JOIN tt_students s ON s.id = a.student_id
        WHERE s.active AND (a.day BETWEEN ${week}::date AND ${week}::date + 4 OR a.day = (now() AT TIME ZONE 'Asia/Seoul')::date)`,
  ]);
  const saved = settings[0]?.value;
  return {
    week,
    students: students.map((r) => ({ id: r.id as number, name: r.name as string, note: r.note as string, duration: (r.duration as number | null) ?? null })),
    attend: attend.map((r) => ({ studentId: r.student_id as number, day: r.day as string, at: r.at as string })),
    regular: regular.map((r) => ({ studentId: r.student_id as number, weekday: r.weekday as Weekday, time: r.time as string, arrive: (r.arrive as string | null) ?? null })),
    overrides: overrides.map((r) => ({
      studentId: r.student_id as number,
      weekday: r.weekday as Weekday,
      time: (r.time as string | null) ?? null,
      arrive: (r.arrive as string | null) ?? null,
      fromWeekday: (r.from_weekday as Weekday | null) ?? null,
    })),
    rows: Array.isArray(saved) && saved.length && saved.every(isClock) ? (saved as string[]) : DEFAULT_ROWS,
  };
}

/** 한 학생의 그 주 상태: 요일별 평소 시각·이번 주 변경, 실제로 오는지 */
async function stateOf(studentId: number, week: string) {
  const sql = db();
  const [st, reg, ov] = await Promise.all([
    sql`SELECT 1 FROM tt_students WHERE id = ${studentId} AND active`,
    sql`SELECT weekday, time, arrive FROM tt_regular WHERE student_id = ${studentId}`,
    sql`SELECT weekday, time, from_weekday FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week}`,
  ]);
  if (!st.length) throw new TimetableError("NOT_FOUND", "학생을 찾을 수 없습니다.", 404);
  const regular = new Map(reg.map((r) => [r.weekday as number, r.time as string]));
  const regArrive = new Map(reg.map((r) => [r.weekday as number, (r.arrive as string | null) ?? null]));
  const over = new Map(ov.map((r) => [r.weekday as number, { time: (r.time as string | null) ?? null, from: (r.from_weekday as number | null) ?? null }]));
  /** 그 요일에 실제로 오는 시각 (안 오면 null) */
  const effective = (d: number) => (over.has(d) ? over.get(d)!.time : (regular.get(d) ?? null));
  /** 평소 도착 시각 (없으면 null) */
  const arriveOf = (d: number) => regArrive.get(d) ?? null;
  return { regular, over, effective, arriveOf };
}

const conflict = (d: number, time: string) =>
  new TimetableError("CONFLICT", `이미 ${DAY[d]}요일 ${short(time)}에 등원이 있어요. 그 등원을 먼저 바꾸거나 빼 주세요.`, 409);

/* ─────────── 쓰기 (각 함수 = 한 번의 변경 = 한 트랜잭션) ─────────── */

/** 학생 추가·수정: 이름·메모 + 평소 등원(요일별 시각, 없으면 그 요일은 안 옴) */
export type SlotInput = { weekday: Weekday; time: string; arrive?: string | null };

export async function saveStudent(input: { id?: number; name: string; note: string; duration: number | null; slots: SlotInput[] }) {
  await ensureSchema();
  const sql = db();
  const days = input.slots.map((s) => s.weekday);
  const times = input.slots.map((s) => s.time);
  const arrives = input.slots.map((s) => s.arrive ?? null);
  if (input.id) {
    const ok = await sql`SELECT 1 FROM tt_students WHERE id = ${input.id} AND active`;
    if (!ok.length) throw new TimetableError("NOT_FOUND", "학생을 찾을 수 없습니다.", 404);
  } else {
    const n = await sql`SELECT count(*)::int AS n FROM tt_students WHERE active`;
    if ((n[0].n as number) >= MAX_STUDENTS) throw new TimetableError("TOO_MANY", "학생 수가 너무 많습니다.");
  }
  // 새 학생 번호를 먼저 받아 두면 학생·평소 시간을 한 트랜잭션에 넣을 수 있다
  const id = input.id ?? ((await sql`SELECT nextval(pg_get_serial_sequence('tt_students', 'id'))::int AS id`)[0].id as number);
  await sql.transaction([
    input.id
      ? sql`UPDATE tt_students SET name = ${input.name}, note = ${input.note}, duration = ${input.duration} WHERE id = ${id}`
      : sql`INSERT INTO tt_students (id, name, note, duration) VALUES (${id}, ${input.name}, ${input.note}, ${input.duration})`,
    sql`DELETE FROM tt_regular WHERE student_id = ${id}`,
    sql`INSERT INTO tt_regular (student_id, weekday, time, arrive) SELECT ${id}, d, t, a FROM unnest(${days}::smallint[], ${times}::text[], ${arrives}::text[]) AS x(d, t, a)`,
  ]);
  return id;
}

/** 여러 명 한 번에 등록 — 전부 저장되거나 하나도 저장되지 않는다 */
export async function bulkAdd(items: { name: string; slots: SlotInput[] }[]) {
  await ensureSchema();
  if (items.length > MAX_BULK) throw new TimetableError("TOO_MANY", `한 번에 ${MAX_BULK}명까지 등록할 수 있어요.`);
  const sql = db();
  const n = await sql`SELECT count(*)::int AS n FROM tt_students WHERE active`;
  if ((n[0].n as number) + items.length > MAX_STUDENTS) throw new TimetableError("TOO_MANY", "학생 수가 너무 많습니다.");
  const ids = (await sql`SELECT nextval(pg_get_serial_sequence('tt_students', 'id'))::int AS id FROM generate_series(1, ${items.length})`).map(
    (r) => r.id as number,
  );
  const names = items.map((it) => it.name);
  const sIds: number[] = [];
  const days: number[] = [];
  const times: string[] = [];
  const arrives: (string | null)[] = [];
  items.forEach((it, i) =>
    it.slots.forEach((s) => {
      sIds.push(ids[i]);
      days.push(s.weekday);
      times.push(s.time);
      arrives.push(s.arrive ?? null);
    }),
  );
  await sql.transaction([
    sql`INSERT INTO tt_students (id, name) SELECT i, n FROM unnest(${ids}::int[], ${names}::text[]) AS x(i, n)`,
    sql`INSERT INTO tt_regular (student_id, weekday, time, arrive) SELECT s, d, t, a FROM unnest(${sIds}::int[], ${days}::smallint[], ${times}::text[], ${arrives}::text[]) AS x(s, d, t, a)`,
  ]);
}

/** 메모·수업시간만 바꾸기 (평소 시간표는 그대로) */
export async function saveInfo(id: number, note: string, duration: number | null) {
  await ensureSchema();
  const r = await db()`UPDATE tt_students SET note = ${note}, duration = ${duration} WHERE id = ${id} AND active RETURNING id`;
  if (!r.length) throw new TimetableError("NOT_FOUND", "학생을 찾을 수 없습니다.", 404);
}

/** 출석! — 오늘(한국 날짜) 처음 누른 시각을 남긴다. 이미 눌렀으면 그대로 */
export async function checkIn(id: number) {
  await ensureSchema();
  const sql = db();
  const ok = await sql`SELECT 1 FROM tt_students WHERE id = ${id} AND active`;
  if (!ok.length) throw new TimetableError("NOT_FOUND", "학생을 찾을 수 없습니다.", 404);
  await sql`INSERT INTO tt_attend (student_id, day) VALUES (${id}, (now() AT TIME ZONE 'Asia/Seoul')::date) ON CONFLICT DO NOTHING`;
}

/** 오늘 출석 취소 (잘못 누른 경우) */
export async function undoCheckIn(id: number) {
  await ensureSchema();
  await db()`DELETE FROM tt_attend WHERE student_id = ${id} AND day = (now() AT TIME ZONE 'Asia/Seoul')::date`;
}

export async function removeStudent(id: number) {
  await ensureSchema();
  await db()`UPDATE tt_students SET active = FALSE WHERE id = ${id}`;
}

/** 이번 주만 옮기기·시간 바꾸기 (같은 요일이면 시각만) */
export async function moveOnce(studentId: number, week: string, from: Weekday, to: Weekday, time: string, arrive: string | null = null) {
  await ensureSchema();
  const sql = db();
  const s = await stateOf(studentId, week);
  if (from === to) {
    await (time === s.regular.get(from) && arrive === s.arriveOf(from)
      ? sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND weekday = ${from}`
      : sql`INSERT INTO tt_overrides (student_id, week_start, weekday, time, arrive, from_weekday) VALUES (${studentId}, ${week}, ${from}, ${time}, ${arrive}, ${s.over.get(from)?.from ?? null})
            ON CONFLICT (student_id, week_start, weekday) DO UPDATE SET time = EXCLUDED.time, arrive = EXCLUDED.arrive, updated_at = now()`);
    return;
  }
  const busyTo = s.effective(to);
  if (busyTo) throw conflict(to, busyTo);
  // 처음 출발한 요일: 이미 옮겨 온 등원이면 그 원래 요일, 아니면 평소 등원이 있는 이 요일
  const origin = s.over.get(from)?.from ?? (s.regular.has(from) ? from : null);
  const backHome = origin === to;
  await sql.transaction([
    s.regular.has(from)
      ? sql`INSERT INTO tt_overrides (student_id, week_start, weekday, time, from_weekday) VALUES (${studentId}, ${week}, ${from}, NULL, NULL)
            ON CONFLICT (student_id, week_start, weekday) DO UPDATE SET time = NULL, from_weekday = NULL, updated_at = now()`
      : sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND weekday = ${from}`,
    backHome && time === s.regular.get(to) && arrive === s.arriveOf(to)
      ? sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND weekday = ${to}`
      : sql`INSERT INTO tt_overrides (student_id, week_start, weekday, time, arrive, from_weekday) VALUES (${studentId}, ${week}, ${to}, ${time}, ${arrive}, ${backHome ? null : origin})
            ON CONFLICT (student_id, week_start, weekday) DO UPDATE SET time = EXCLUDED.time, arrive = EXCLUDED.arrive, from_weekday = EXCLUDED.from_weekday, updated_at = now()`,
  ]);
}

/** 매주 옮기기·시간 바꾸기: 평소 시간표를 바꾸고 그 주의 해당 변경은 지운다 */
export async function moveWeekly(studentId: number, week: string, from: Weekday, to: Weekday, time: string, arrive: string | null = null) {
  await ensureSchema();
  const sql = db();
  const s = await stateOf(studentId, week);
  // 이번 주에 다른 요일에서 옮겨 온 등원이면, 매주 바꿀 대상은 그 원래 요일
  if (!s.regular.has(from) && s.over.get(from)?.from) from = s.over.get(from)!.from as Weekday;
  if (from !== to && s.regular.has(to)) throw conflict(to, s.regular.get(to)!);
  await sql.transaction([
    sql`DELETE FROM tt_regular WHERE student_id = ${studentId} AND weekday = ${from} AND ${from !== to}`,
    sql`INSERT INTO tt_regular (student_id, weekday, time, arrive) VALUES (${studentId}, ${to}, ${time}, ${arrive})
        ON CONFLICT (student_id, weekday) DO UPDATE SET time = EXCLUDED.time, arrive = EXCLUDED.arrive`,
    sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week}
        AND (weekday IN (${from}, ${to}) OR from_weekday IN (${from}, ${to}))`,
  ]);
}

/** 빈 요일에 넣기 — 이번 주만(추가 등원) 또는 매주(평소 등원) */
export async function addVisit(studentId: number, week: string, weekday: Weekday, time: string, weekly: boolean, arrive: string | null = null) {
  await ensureSchema();
  const sql = db();
  const s = await stateOf(studentId, week);
  if (weekly) {
    if (s.regular.has(weekday)) throw conflict(weekday, s.regular.get(weekday)!);
    await sql.transaction([
      sql`INSERT INTO tt_regular (student_id, weekday, time, arrive) VALUES (${studentId}, ${weekday}, ${time}, ${arrive})`,
      sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND weekday = ${weekday}`,
    ]);
    return;
  }
  const busy = s.effective(weekday);
  if (busy) throw conflict(weekday, busy);
  await (time === s.regular.get(weekday) && arrive === s.arriveOf(weekday)
    ? sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND weekday = ${weekday}`
    : sql`INSERT INTO tt_overrides (student_id, week_start, weekday, time, arrive, from_weekday) VALUES (${studentId}, ${week}, ${weekday}, ${time}, ${arrive}, NULL)
          ON CONFLICT (student_id, week_start, weekday) DO UPDATE SET time = EXCLUDED.time, arrive = EXCLUDED.arrive, from_weekday = NULL, updated_at = now()`);
}

/** 이번 주 그 요일 등원 빼기: 평소 등원이면 '쉼', 추가·옮겨 온 등원이면 지움 */
export async function skipOnce(studentId: number, week: string, weekday: Weekday) {
  await ensureSchema();
  const sql = db();
  const s = await stateOf(studentId, week);
  await (s.regular.has(weekday)
    ? sql`INSERT INTO tt_overrides (student_id, week_start, weekday, time, from_weekday) VALUES (${studentId}, ${week}, ${weekday}, NULL, NULL)
          ON CONFLICT (student_id, week_start, weekday) DO UPDATE SET time = NULL, from_weekday = NULL, updated_at = now()`
    : sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND weekday = ${weekday}`);
}

/** 평소대로 되돌리기: 그 요일의 이번 주 변경 + 함께 묶인 옮기기(출발·도착 요일)까지 한 번에 지운다 */
export async function restore(studentId: number, week: string, weekday: Weekday) {
  await ensureSchema();
  const sql = db();
  const s = await stateOf(studentId, week);
  const from = s.over.get(weekday)?.from ?? null;
  await sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week}
    AND (weekday = ${weekday} OR from_weekday = ${weekday} OR weekday = ${from ?? 0})`;
}

/** 매주 그 요일 등원 없애기 (그 주 변경도 정리) */
export async function removeRegularDay(studentId: number, week: string, weekday: Weekday) {
  await ensureSchema();
  const sql = db();
  await stateOf(studentId, week);
  await sql.transaction([
    sql`DELETE FROM tt_regular WHERE student_id = ${studentId} AND weekday = ${weekday}`,
    sql`DELETE FROM tt_overrides WHERE student_id = ${studentId} AND week_start = ${week} AND (weekday = ${weekday} OR from_weekday = ${weekday})`,
  ]);
}

/**
 * 이번 주 시간표를 앞으로 계속 쓰기: 그 주의 변경(시간 변경·쉼·옮김·추가)을 평소 시간표에 반영하고 그 주 변경 기록은 지운다.
 * 다른 주에 따로 적어 둔 변경은 그대로 둔다.
 */
export async function fixWeek(week: string) {
  await ensureSchema();
  const sql = db();
  await sql.transaction([
    sql`DELETE FROM tt_regular r USING tt_overrides o
        WHERE o.week_start = ${week} AND o.time IS NULL AND r.student_id = o.student_id AND r.weekday = o.weekday`,
    sql`INSERT INTO tt_regular (student_id, weekday, time, arrive)
        SELECT o.student_id, o.weekday, o.time, o.arrive FROM tt_overrides o JOIN tt_students s ON s.id = o.student_id
        WHERE o.week_start = ${week} AND o.time IS NOT NULL AND s.active
        ON CONFLICT (student_id, weekday) DO UPDATE SET time = EXCLUDED.time, arrive = EXCLUDED.arrive`,
    sql`DELETE FROM tt_overrides WHERE week_start = ${week}`,
  ]);
}

/** 시간표 왼쪽 시간 칸 저장 (정렬·중복 제거) */
export async function saveRows(rows: string[]) {
  await ensureSchema();
  const clean = [...new Set(rows.filter(isTime))].sort().slice(0, MAX_ROWS);
  if (!clean.length) throw new TimetableError("ROWS_EMPTY", "시간 칸을 하나 이상 넣어 주세요.");
  await db()`INSERT INTO tt_settings (key, value) VALUES ('rows', ${JSON.stringify(clean)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}
