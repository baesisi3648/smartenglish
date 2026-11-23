"use client";

import { useEffect, useMemo, useState } from "react";
import { kstWeekday, weekStartOf } from "@/studio/week";
import type { Student, WeekData, Weekday } from "@/studio/timetable";
import StudioHeader from "../studio-header";
import { MAX_BULK_ROWS, parseBulk } from "./parse-bulk";

/**
 * 등원 시간표: 종이 시간표와 같은 모양(월~금 × 시간 칸).
 * - 빈 칸 클릭 = 학생 넣기 · 이름 클릭 = 바꾸기 · 이름을 다른 칸으로 끌어다 놓기 = 옮기기
 * - 바꿀 때마다 "이번 주만"(다음 주엔 평소대로) / "매주"(평소 시간 변경) 중 고른다
 * - 왼쪽 시간 칸은 ⚙️ 시간 칸에서 직접 정한다
 */

const DAYS: Weekday[] = [1, 2, 3, 4, 5];
const DAY_LABEL = ["", "월", "화", "수", "목", "금"];

type Status = "regular" | "moved" | "extra" | "off";
type Entry = { student: Student; weekday: Weekday; time: string; arrive: string | null; status: Status; regularTime?: string; fromWeekday?: Weekday | null };
type Body = Record<string, unknown>;

const hourOf = (t: string) => Number(t.slice(0, 2));
const h12 = (h: number) => (h > 12 ? h - 12 : h);
/** "15:20" → "3:20" (종이 시간표처럼) */
const short = (t: string) => `${h12(hourOf(t))}:${t.slice(3)}`;
const rowLabel = (t: string) => (t.endsWith(":00") ? `${h12(hourOf(t))}시` : short(t));
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
/** 그 주 월요일 기준 "26년 11월 4주차" */
const weekLabel = (mon: string) => `${mon.slice(2, 4)}년 ${Number(mon.slice(5, 7))}월 ${Math.floor((Number(mon.slice(8, 10)) - 1) / 7) + 1}주차`;
/** 칸 안 이름 옆 괄호: 언제나 오는 시각 — 실제 도착 시각이 있으면 그것, 없으면 수업 시각 (10분 단위로 다르니 정각도 표시) */
/** 실제로 오는 시각: 도착 시각이 따로 있으면 그것, 없으면 수업 시각 — 시간표 칸도 이 시각으로 정한다 */
const placeOf = (e: { time: string; arrive: string | null }) => e.arrive ?? e.time;
/**
 * 이름 옆 괄호: 오는 시각. 바뀐 경우엔 "원래 → 바뀐" (예: 3:00 → 1:40)
 * - 도착 시각이 수업 시각과 다름 / 이번 주만 시간이 바뀜(평소 시각과 다름)
 */
const badge = (e: { time: string; arrive: string | null; status: Status; regularTime?: string }) => {
  const now = placeOf(e);
  const before = e.arrive && e.arrive !== e.time ? e.time : e.status === "moved" && e.regularTime && e.regularTime !== now ? e.regularTime : null;
  return before ? `${short(before)} → ${short(now)}` : short(now);
};
const plusHour = (t: string) => `${String(Math.min(23, hourOf(t) + 1)).padStart(2, "0")}:${t.slice(3)}`;
/** 학생 시각이 들어갈 칸: 시각보다 같거나 이른 칸 중 마지막 (첫 칸보다 이르면 첫 칸) */
const rowIndex = (time: string, rows: string[]) => {
  let i = 0;
  rows.forEach((r, k) => r <= time && (i = k));
  return i;
};

function buildEntries(d: WeekData): Entry[] {
  const out: Entry[] = [];
  for (const s of d.students) {
    for (const day of DAYS) {
      const reg = d.regular.find((r) => r.studentId === s.id && r.weekday === day);
      const ov = d.overrides.find((o) => o.studentId === s.id && o.weekday === day);
      if (ov) {
        if (ov.time === null) {
          if (reg) out.push({ student: s, weekday: day, time: reg.time, arrive: reg.arrive, status: "off", regularTime: reg.time });
        } else out.push({ student: s, weekday: day, time: ov.time, arrive: ov.arrive, status: reg ? "moved" : "extra", regularTime: reg?.time, fromWeekday: ov.fromWeekday });
      } else if (reg) out.push({ student: s, weekday: day, time: reg.time, arrive: reg.arrive, status: "regular", regularTime: reg.time });
    }
  }
  return out.sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || a.student.name.localeCompare(b.student.name, "ko"));
}

/** 읽기·변경 모두 POST (출처·로그인 검사를 같은 규칙으로). 끝나면 그 주 시간표 전체가 돌아온다 */
async function call(body: Body): Promise<WeekData> {
  const res = await fetch("/api/studio/timetable", {
    method: "POST",
    headers: { "X-Studio-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { success: boolean; data: WeekData; error?: string } | null;
  if (!json?.success) throw new Error(json?.error ?? "저장하지 못했습니다. 다시 시도해 주세요.");
  return json.data;
}

type Editor =
  | { kind: "entry"; entry: Entry; toDay?: Weekday; toTime?: string }
  | { kind: "add"; weekday: Weekday; time: string }
  | { kind: "student"; student?: Student }
  | { kind: "rows" }
  | { kind: "bulk" };

export default function TimetableClient({
  initial,
  thisWeek: initialThisWeek,
  todayWeekday: initialToday,
  capacity,
}: {
  initial: WeekData;
  thisWeek: string;
  todayWeekday: number;
  capacity: number;
}) {
  const [data, setData] = useState(initial);
  // 화면을 켜 둔 채 주가 바뀌어도 '이번 주'가 맞게: 창으로 돌아올 때·1분마다 다시 계산
  const [thisWeek, setThisWeek] = useState(initialThisWeek);
  const [todayWeekday, setTodayWeekday] = useState(initialToday);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setThisWeek(weekStartOf(now));
      setTodayWeekday(kstWeekday(now));
    };
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showStudents, setShowStudents] = useState(initial.students.length === 0);
  const [dragOver, setDragOver] = useState<string | null>(null);
  /** 끌어다 놓은 뒤 잠깐 뜨는 알림: 되돌리기 / 매주로 바꾸기 */
  const [toast, setToast] = useState<{ text: string; undo?: Body; weekly?: Body } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const entries = useMemo(() => buildEntries(data), [data]);
  const changes = entries.filter((e) => e.status !== "regular").length;
  const isThisWeek = data.week === thisWeek;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setEditor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  /** 변경 하나 = 요청 하나(서버에서 한 트랜잭션). 실패하면 창을 열어 둔 채 이유를 보여 준다 */
  async function save(body: Body) {
    setBusy(true);
    setError("");
    try {
      setData(await call({ week: data.week, ...body }));
      setEditor(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function goWeek(w: string) {
    setBusy(true);
    setError("");
    try {
      setData(await call({ action: "getWeek", week: w }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }

  /** 끌어다 놓기 = 바로 '이번 주만' 저장 (구글 캘린더처럼). 알림에서 되돌리기·매주로 바꾸기 */
  async function onDrop(e: React.DragEvent, weekday: Weekday, rowTime: string) {
    e.preventDefault();
    setDragOver(null);
    const key = e.dataTransfer.getData("text/plain");
    const entry = entries.find((x) => `${x.student.id}-${x.weekday}` === key);
    if (!entry || entry.status === "off" || busy) return;
    const ri = data.rows.indexOf(rowTime);
    if (entry.weekday === weekday && rowIndex(placeOf(entry), data.rows) === ri) return; // 같은 칸
    const name = entry.student.name;
    const clash = entry.weekday !== weekday && entries.find((x) => x.student.id === entry.student.id && x.weekday === weekday && x.status !== "off");
    if (clash) {
      setToast({ text: `${name}은(는) 이미 ${DAY_LABEL[weekday]}요일 ${short(clash.time)}에 와요. 그 등원을 먼저 바꿔 주세요.` });
      return;
    }
    // 다른 칸으로 가면 그 칸의 시작 시각, 도착 시각 메모는 새 칸에 맞지 않을 수 있어 비움
    const ok = await save({ action: "moveOnce", studentId: entry.student.id, from: entry.weekday, to: weekday, time: rowTime });
    if (!ok) return;
    setToast({
      text: `${name} → ${DAY_LABEL[weekday]} ${rowLabel(rowTime)} (이번 주만)`,
      undo: { action: "moveOnce", studentId: entry.student.id, from: weekday, to: entry.weekday, time: entry.time, arrive: entry.arrive },
      weekly: { action: "moveWeekly", studentId: entry.student.id, from: weekday, to: weekday, time: rowTime },
    });
  }

  return (
    <div className="min-h-dvh bg-bg-soft print:bg-white">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .no-print { display: none !important; } }`}</style>
      <StudioHeader active="timetable" wide />

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 print:max-w-none print:p-0">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={busy} onClick={() => goWeek(addDays(data.week, -7))} className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-line">
              ◀ 지난주
            </button>
            <button
              type="button"
              disabled={busy || isThisWeek}
              onClick={() => goWeek(thisWeek)}
              className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-line disabled:opacity-50"
            >
              이번 주
            </button>
            <button type="button" disabled={busy} onClick={() => goWeek(addDays(data.week, 7))} className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-line">
              다음 주 ▶
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setEditor({ kind: "rows" })} className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-hb-navy ring-1 ring-line">
              ⚙️ 시간 칸
            </button>
            <button type="button" onClick={() => setShowStudents((v) => !v)} className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-hb-navy ring-1 ring-line">
              👧 학생 관리 ({data.students.length})
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-full bg-hb-navy px-4 py-1.5 text-sm font-bold text-white">
              🖨 인쇄
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-round text-lg text-hb-navy">
            {weekLabel(data.week)} <span className="text-sm font-normal text-ink-soft">({md(data.week)} ~ {md(addDays(data.week, 4))})</span>
            {isThisWeek && <span className="no-print ml-2 rounded-full bg-hb-yellow px-2 py-0.5 text-xs text-ink">이번 주</span>}
            {busy && <span className="no-print ml-2 text-xs font-normal text-ink-soft">저장 중…</span>}
          </h1>
          <p className="no-print text-xs text-ink-soft">
            빈 칸 클릭 = 넣기 · 이름 클릭 = 바꾸기 · 이름 끌어다 놓기 = 이번 주만 옮기기 · <span className="rounded bg-amber-100 px-1">노란색</span> = 이번 주만 변경 ({changes}건)
          </p>
        </div>

        {error && !editor && <p className="no-print rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {changes > 0 && (
          <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm ring-1 ring-amber-200">
            <span>
              이 주에 <b>{changes}건</b> 바뀌었어요. 다음 주부터도 이대로라면 고정해 두세요.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm(`${weekLabel(data.week)} 시간표를 다음 주부터도 그대로 쓸까요? (바뀐 시간이 평소 시간표가 돼요)`) && save({ action: "fixWeek" })}
              className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              📌 이 주 시간표를 앞으로 계속 쓰기
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line print:rounded-none print:ring-0">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-16 border-b border-line p-2">
                  <button type="button" onClick={() => setEditor({ kind: "rows" })} className="no-print text-xs font-normal text-ink-soft underline" title="시간 칸 바꾸기">
                    시간 ⚙️
                  </button>
                </th>
                {DAYS.map((d) => (
                  <th key={d} className={`border-b border-l border-line p-2 text-center font-bold ${isThisWeek && todayWeekday === d ? "bg-hb-yellow/40" : ""}`}>
                    {DAY_LABEL[d]} <span className="text-xs font-normal text-ink-soft">{md(addDays(data.week, d - 1))}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((rowTime, ri) => (
                <tr key={rowTime} className="align-top">
                  <th className="border-t border-line p-2 text-center text-sm font-bold text-ink-soft">{rowLabel(rowTime)}</th>
                  {DAYS.map((d) => {
                    const cell = entries.filter((e) => e.weekday === d && rowIndex(placeOf(e), data.rows) === ri);
                    const count = cell.filter((e) => e.status !== "off").length;
                    const over = count > capacity;
                    const key = `${d}-${rowTime}`;
                    return (
                      <td
                        key={d}
                        onClick={(ev) => ev.target === ev.currentTarget && setEditor({ kind: "add", weekday: d, time: rowTime })}
                        onDragOver={(ev) => {
                          ev.preventDefault();
                          setDragOver(key);
                        }}
                        onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                        onDrop={(ev) => onDrop(ev, d, rowTime)}
                        className={`group relative h-24 cursor-pointer border-t border-l border-line p-1.5 pr-7 transition-colors print:cursor-auto ${
                          dragOver === key ? "bg-sky-100" : over ? "bg-red-50" : isThisWeek && todayWeekday === d ? "bg-hb-yellow/10" : "hover:bg-sky-50/60"
                        }`}
                      >
                        <div className="pointer-events-none flex flex-wrap gap-1">
                          {cell.map((e) => (
                            <button
                              key={`${e.student.id}-${e.weekday}`}
                              type="button"
                              draggable={e.status !== "off"}
                              onDragStart={(ev) => {
                                ev.dataTransfer.setData("text/plain", `${e.student.id}-${e.weekday}`);
                                ev.dataTransfer.effectAllowed = "move";
                              }}
                              onClick={() => setEditor({ kind: "entry", entry: e })}
                              title={[e.student.note, e.status !== "off" ? "끌어다 놓아 옮길 수 있어요" : ""].filter(Boolean).join(" · ") || undefined}
                              className={`pointer-events-auto cursor-grab rounded-md px-1.5 py-0.5 text-[13px] leading-5 active:cursor-grabbing print:px-0.5 ${
                                e.status === "regular"
                                  ? "bg-bg-soft text-ink hover:ring-1 hover:ring-hb-blue"
                                  : e.status === "off"
                                    ? "cursor-pointer text-ink-soft line-through opacity-60"
                                    : "bg-amber-100 font-bold text-amber-900 ring-1 ring-amber-300"
                              }`}
                            >
                              {e.student.name}
                              {e.status !== "off" && <span className="ml-0.5 text-[11px]">({badge(e)})</span>}
                              {e.status === "off" && <span className="ml-0.5 text-[11px]">쉼</span>}
                            </button>
                          ))}
                        </div>
                        {count > 0 && (
                          <span className={`pointer-events-none absolute top-1 right-1.5 text-[11px] font-bold ${over ? "text-red-700" : "text-ink-soft"}`}>{count}명</span>
                        )}
                        <span className="no-print pointer-events-none absolute right-1.5 bottom-1 text-base font-bold text-hb-blue opacity-0 group-hover:opacity-70">+</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="no-print text-xs text-ink-soft">
          칸 오른쪽 위 숫자 = 그 시간 등원 인원 (정원 {capacity}명을 넘으면 빨간색) · 학생 시각은 같거나 바로 앞 시간 칸에 들어가요 (예: 2:40 → 2시 칸).
        </p>

        {showStudents && (
          <StudentList data={data} onEdit={(s) => setEditor({ kind: "student", student: s })} onAdd={() => setEditor({ kind: "student" })} onBulk={() => setEditor({ kind: "bulk" })} />
        )}
      </main>

      {toast && (
        <div role="status" className="no-print fixed bottom-5 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-xl">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" disabled={busy} onClick={() => save(toast.undo!).then((ok) => ok && setToast(null))} className="font-bold text-hb-yellow underline">
              되돌리기
            </button>
          )}
          {toast.weekly && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save(toast.weekly!).then((ok) => ok && setToast({ text: "매주 이 시간으로 바꿨어요" }))}
              className="font-bold text-sky-300 underline"
            >
              매주로 바꾸기
            </button>
          )}
          <button type="button" onClick={() => setToast(null)} aria-label="알림 닫기" className="text-white/60">
            ✕
          </button>
        </div>
      )}

      {editor && (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !busy && setEditor(null)}>
          <div role="dialog" aria-modal="true" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {editor.kind === "entry" && (
              <EntryEditor {...editor} entries={entries} busy={busy} save={save} onStudent={(s) => setEditor({ kind: "student", student: s })} />
            )}
            {editor.kind === "add" && <AddEditor {...editor} data={data} entries={entries} busy={busy} save={save} />}
            {editor.kind === "student" && <StudentEditor student={editor.student} data={data} busy={busy} save={save} />}
            {editor.kind === "rows" && <RowsEditor rows={data.rows} busy={busy} save={save} />}
            {editor.kind === "bulk" && <BulkEditor busy={busy} save={save} />}
            {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
            <button type="button" disabled={busy} onClick={() => setEditor(null)} className="mt-3 w-full rounded-full py-2 text-sm text-ink-soft">
              닫기 (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Save = (body: Body) => Promise<boolean>;

const PRIMARY = "w-full rounded-full bg-hb-navy py-2.5 text-sm font-bold text-white disabled:opacity-50";
const SECONDARY = "w-full rounded-full border-2 border-hb-navy py-2 text-sm font-bold text-hb-navy disabled:opacity-50";
const INPUT = "rounded-lg border border-line px-3 py-2 text-sm";

function ArriveInput({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-soft">
      <span className="shrink-0">실제 도착 (선택)</span>
      <input type="time" step={600} value={value} onChange={(e) => setValue(e.target.value)} className={`${INPUT} min-w-0 flex-1 py-1`} />
      {value && (
        <button type="button" onClick={() => setValue("")} className="underline">
          지우기
        </button>
      )}
    </label>
  );
}

function DayTime({ day, time, setDay, setTime }: { day: Weekday; time: string; setDay: (d: Weekday) => void; setTime: (t: string) => void }) {
  return (
    <div className="flex gap-2">
      <div className="flex rounded-lg bg-bg-soft p-0.5">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`rounded-md px-2.5 py-1.5 text-sm font-bold ${day === d ? "bg-hb-navy text-white" : "text-ink-soft"}`}
          >
            {DAY_LABEL[d]}
          </button>
        ))}
      </div>
      <input type="time" step={600} value={time} onChange={(e) => setTime(e.target.value)} className={`${INPUT} min-w-0 flex-1`} />
    </div>
  );
}

function EntryEditor({
  entry,
  toDay,
  toTime,
  entries,
  busy,
  save,
  onStudent,
}: {
  entry: Entry;
  toDay?: Weekday;
  toTime?: string;
  entries: Entry[];
  busy: boolean;
  save: Save;
  onStudent: (s: Student) => void;
}) {
  const [day, setDay] = useState<Weekday>(toDay ?? entry.weekday);
  const [time, setTime] = useState(toTime ?? entry.time);
  const [arrive, setArrive] = useState(toTime ? "" : (entry.arrive ?? ""));
  const sid = entry.student.id;
  const here = { studentId: sid, weekday: entry.weekday };
  const moving = day !== entry.weekday;
  const dirty = moving || time !== entry.time || (arrive || null) !== entry.arrive;
  // 옮길 요일에 이 학생이 이미 오면 막는다 (덮어쓰지 않게)
  const clash = moving ? entries.find((e) => e.student.id === sid && e.weekday === day && e.status !== "off") : undefined;
  const canRestore = entry.status !== "regular" && (!!entry.regularTime || !!entry.fromWeekday);

  const thisWeek = () =>
    entry.status === "off" && !moving && time === entry.regularTime && (arrive || null) === entry.arrive
      ? save({ action: "restore", ...here }) // 쉼 → 평소 시간 그대로 오면 되돌리기 (옮긴 짝도 함께)
      : save({ action: "moveOnce", studentId: sid, from: entry.weekday, to: day, time, arrive: arrive || null });
  const everyWeek = () => save({ action: "moveWeekly", studentId: sid, from: entry.weekday, to: day, time, arrive: arrive || null });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-extrabold">{entry.student.name}</p>
        <p className="text-xs text-ink-soft">
          {DAY_LABEL[entry.weekday]}요일 · 평소 {entry.regularTime ? short(entry.regularTime) : "등원 없음"}
          {entry.status === "moved" && ` → 이번 주만 ${short(entry.time)}`}
          {entry.status === "extra" && (entry.fromWeekday ? ` → 이번 주만 ${DAY_LABEL[entry.fromWeekday]}요일에서 옮겨 옴` : ` → 이번 주만 추가 ${short(entry.time)}`)}
          {entry.status === "off" && " → 이번 주 쉼"}
        </p>
      </div>

      <DayTime day={day} time={time} setDay={setDay} setTime={setTime} />
      <ArriveInput value={arrive} setValue={setArrive} />
      {clash ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
          이미 {DAY_LABEL[day]}요일 {short(clash.time)}에 등원이 있어요. 그 등원을 먼저 바꾸거나 빼 주세요.
        </p>
      ) : (
        dirty && (
          <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">
            {DAY_LABEL[entry.weekday]} {short(entry.time)} → <b>{DAY_LABEL[day]} {time ? short(time) : "?"}</b>
          </p>
        )
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy || !time || !!clash || (!dirty && entry.status !== "off")} onClick={thisWeek} className={PRIMARY}>
          이번 주만
        </button>
        <button type="button" disabled={busy || !time || !!clash} onClick={everyWeek} className={SECONDARY}>
          매주 이렇게
        </button>
      </div>
      <p className="text-[11px] leading-4 text-ink-soft">이번 주만 = 다음 주엔 평소대로 돌아가요 · 매주 = 평소 시간표가 바뀌어요</p>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {entry.status !== "off" && (
          <button type="button" disabled={busy} onClick={() => save({ action: "skipOnce", ...here })} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold">
            {entry.regularTime ? "이번 주 쉼" : "이번 주 등원 빼기"}
          </button>
        )}
        {canRestore && (
          <button type="button" disabled={busy} onClick={() => save({ action: "restore", ...here })} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold">
            평소대로 되돌리기
          </button>
        )}
        {entry.regularTime && (
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(`${entry.student.name} — 매주 ${DAY_LABEL[entry.weekday]}요일 등원을 없앨까요?`) && save({ action: "removeRegularDay", ...here })}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-bold"
          >
            매주 {DAY_LABEL[entry.weekday]}요일 빼기
          </button>
        )}
        <button type="button" onClick={() => onStudent(entry.student)} className="rounded-full px-3 py-1.5 text-xs font-bold text-hb-navy underline">
          학생 정보 전체 보기
        </button>
      </div>
    </div>
  );
}

function AddEditor({ weekday, time: initialTime, data, entries, busy, save }: { weekday: Weekday; time: string; data: WeekData; entries: Entry[]; busy: boolean; save: Save }) {
  const [day, setDay] = useState<Weekday>(weekday);
  const [time, setTime] = useState(initialTime);
  // 고른 요일에 아직 오지 않는 학생만 (요일을 바꾸면 다시 계산)
  const taken = new Set(entries.filter((e) => e.weekday === day && e.status !== "off").map((e) => e.student.id));
  const options = data.students.filter((s) => !taken.has(s.id));
  const [mode, setMode] = useState<"old" | "new">(options.length ? "old" : "new");
  const [picked, setPicked] = useState(0);
  const sid = options.some((s) => s.id === picked) ? picked : (options[0]?.id ?? 0);
  const [name, setName] = useState("");
  const [arrive, setArrive] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-lg font-extrabold">학생 넣기</p>
      <div className="flex rounded-lg bg-bg-soft p-0.5 text-sm font-bold">
        {(["old", "new"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md py-1.5 ${mode === m ? "bg-white shadow-sm" : "text-ink-soft"}`}>
            {m === "old" ? "등록된 학생" : "새 학생"}
          </button>
        ))}
      </div>
      <DayTime day={day} time={time} setDay={setDay} setTime={setTime} />
      <ArriveInput value={arrive} setValue={setArrive} />
      {mode === "old" ? (
        options.length ? (
          <select value={sid} onChange={(e) => setPicked(Number(e.target.value))} className={`${INPUT} w-full`}>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-ink-soft">{DAY_LABEL[day]}요일에 넣을 수 있는 등록 학생이 없어요 (모두 이미 와요). &lsquo;새 학생&rsquo;을 눌러 주세요.</p>
        )
      ) : (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" className={`${INPUT} w-full`} />
      )}
      {mode === "old" ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy || !sid || !time} onClick={() => save({ action: "addVisit", studentId: sid, weekday: day, time, weekly: false, arrive: arrive || null })} className={PRIMARY}>
            이번 주만
          </button>
          <button type="button" disabled={busy || !sid || !time} onClick={() => save({ action: "addVisit", studentId: sid, weekday: day, time, weekly: true, arrive: arrive || null })} className={SECONDARY}>
            매주
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || !name.trim() || !time}
          onClick={() => save({ action: "saveStudent", name, note: "", slots: [{ weekday: day, time, arrive: arrive || null }] })}
          className={PRIMARY}
        >
          새 학생 등록 (매주 {DAY_LABEL[day]} {time ? short(time) : ""})
        </button>
      )}
    </div>
  );
}

function StudentEditor({ student, data, busy, save }: { student?: Student; data: WeekData; busy: boolean; save: Save }) {
  const [name, setName] = useState(student?.name ?? "");
  const [note, setNote] = useState(student?.note ?? "");
  const [times, setTimes] = useState<Record<number, string>>(() => {
    const t: Record<number, string> = {};
    if (student) data.regular.filter((r) => r.studentId === student.id).forEach((r) => (t[r.weekday] = r.time));
    return t;
  });
  const [arrives, setArrives] = useState<Record<number, string>>(() => {
    const t: Record<number, string> = {};
    if (student) data.regular.filter((r) => r.studentId === student.id && r.arrive).forEach((r) => (t[r.weekday] = r.arrive!));
    return t;
  });
  const slots = DAYS.filter((d) => times[d]).map((d) => ({ weekday: d, time: times[d], arrive: arrives[d] || null }));
  return (
    <div className="space-y-3">
      <p className="text-lg font-extrabold">{student ? `${student.name} · 평소 시간표` : "학생 추가"}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" className={`${INPUT} w-full`} />
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="메모 (선택) 예) 초3 · 파닉스" className={`${INPUT} w-full`} />
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-ink-soft">매주 오는 요일만 수업 시간을 넣어 주세요 (도착이 다르면 오른쪽에)</p>
        {DAYS.map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <span className="w-8 font-bold">{DAY_LABEL[d]}</span>
            <input type="time" step={600} value={times[d] ?? ""} onChange={(e) => setTimes((t) => ({ ...t, [d]: e.target.value }))} className={`${INPUT} min-w-0 flex-1 py-1.5`} />
            {times[d] && (
              <input
                type="time"
                step={300}
                value={arrives[d] ?? ""}
                onChange={(e) => setArrives((t) => ({ ...t, [d]: e.target.value }))}
                title="실제 도착 (선택)"
                aria-label={`${DAY_LABEL[d]}요일 실제 도착 (선택)`}
                className={`${INPUT} w-28 py-1.5 text-xs`}
              />
            )}
            {times[d] ? (
              <button type="button" onClick={() => setTimes((t) => ({ ...t, [d]: "" }))} className="w-12 text-xs text-ink-soft underline">
                안 옴
              </button>
            ) : (
              <span className="w-12 text-xs text-ink-soft">안 옴</span>
            )}
          </label>
        ))}
      </div>
      <button type="button" disabled={busy || !name.trim()} onClick={() => save({ action: "saveStudent", id: student?.id, name, note, slots })} className={PRIMARY}>
        저장
      </button>
      {student && (
        <button
          type="button"
          disabled={busy}
          onClick={() => window.confirm(`${student.name} 학생을 시간표에서 뺄까요? (그만둔 경우)`) && save({ action: "removeStudent", id: student.id })}
          className="w-full text-xs text-red-700 underline"
        >
          이 학생 시간표에서 빼기
        </button>
      )}
    </div>
  );
}

function RowsEditor({ rows: initial, busy, save }: { rows: string[]; busy: boolean; save: Save }) {
  const [rows, setRows] = useState(initial);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("19:00");
  const [step, setStep] = useState(60);
  const valid = rows.filter(Boolean);

  function generate() {
    const out: string[] = [];
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    for (let m = sh * 60 + sm; m <= eh * 60 + em && out.length < 16; m += step) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    if (out.length) setRows(out);
  }

  return (
    <div className="space-y-3">
      <p className="text-lg font-extrabold">시간 칸 설정</p>
      <p className="text-xs text-ink-soft">시간표 왼쪽에 보일 시간이에요. 학생 시각은 같거나 바로 앞 칸에 들어가요.</p>

      <div className="rounded-xl bg-bg-soft p-3">
        <p className="mb-2 text-xs font-bold">한 번에 만들기</p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <input type="time" step={600} value={start} onChange={(e) => setStart(e.target.value)} className={`${INPUT} py-1`} />
          부터
          <input type="time" step={600} value={end} onChange={(e) => setEnd(e.target.value)} className={`${INPUT} py-1`} />
          까지
          <select value={step} onChange={(e) => setStep(Number(e.target.value))} className={`${INPUT} py-1`}>
            <option value={30}>30분 간격</option>
            <option value={60}>1시간 간격</option>
          </select>
          <button type="button" onClick={generate} className="rounded-full bg-white px-3 py-1 text-xs font-bold ring-1 ring-line">
            만들기
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              step={300}
              value={r}
              onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? e.target.value : x)))}
              className={`${INPUT} flex-1 py-1.5`}
            />
            <span className="w-12 text-center text-xs text-ink-soft">{r ? rowLabel(r) : ""}</span>
            <button type="button" disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="text-xs text-ink-soft underline disabled:opacity-30">
              빼기
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={rows.length >= 16}
          onClick={() => setRows((rs) => [...rs, plusHour(rs.filter(Boolean).sort().at(-1) ?? "13:00")])}
          className="flex-1 rounded-full border border-line py-1.5 text-xs font-bold disabled:opacity-40"
        >
          + 칸 추가
        </button>
        <button type="button" onClick={() => setRows(["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"])} className="flex-1 rounded-full border border-line py-1.5 text-xs font-bold">
          기본값 (1~7시)
        </button>
      </div>
      <button type="button" disabled={busy || !valid.length} onClick={() => save({ action: "saveRows", rows: valid })} className={PRIMARY}>
        저장
      </button>
    </div>
  );
}

function BulkEditor({ busy, save }: { busy: boolean; save: Save }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseBulk(text), [text]);
  return (
    <div className="space-y-3">
      <p className="text-lg font-extrabold">여러 명 한 번에 등록</p>
      <p className="text-xs leading-5 text-ink-soft">
        한 줄에 한 명씩: <b>이름 요일시간 요일시간…</b> (1~9시는 오후로 봐요 · 한 번에 {MAX_BULK_ROWS}명까지)
        <br />
        예) <code className="rounded bg-bg-soft px-1">홍길동 월2 화2 목4:20</code> · 도착이 다르면 <code className="rounded bg-bg-soft px-1">월3(1:40)</code>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"홍길동 월2 화2 목4:20\n김철수 수3:30 금3"}
        className={`${INPUT} w-full font-mono`}
      />
      {parsed.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-bg-soft p-2 text-xs">
          {parsed.map((p, i) => (
            <li key={i}>
              <b>{p.name}</b> — {p.slots.length ? p.slots.map((s) => `${DAY_LABEL[s.weekday]} ${short(s.time)}${s.arrive ? `(${short(s.arrive)})` : ""}`).join(" · ") : <span className="text-red-700">요일·시간을 못 찾았어요 (이름만 등록)</span>}
            </li>
          ))}
        </ul>
      )}
      {parsed.length > MAX_BULK_ROWS && (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
          한 번에 {MAX_BULK_ROWS}명까지 등록할 수 있어요 (지금 {parsed.length}명). 나눠서 등록해 주세요.
        </p>
      )}
      <button
        type="button"
        disabled={busy || !parsed.length || parsed.length > MAX_BULK_ROWS}
        onClick={() => save({ action: "bulkAdd", students: parsed })}
        className={PRIMARY}
      >
        {parsed.length ? `${parsed.length}명 등록` : "등록"}
      </button>
    </div>
  );
}

function StudentList({ data, onEdit, onAdd, onBulk }: { data: WeekData; onEdit: (s: Student) => void; onAdd: () => void; onBulk: () => void }) {
  return (
    <section className="no-print rounded-2xl bg-white p-5 ring-1 ring-line">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-round text-lg text-hb-navy">학생 관리 · 평소 시간표</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={onBulk} className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-hb-navy ring-1 ring-line">
            여러 명 한 번에
          </button>
          <button type="button" onClick={onAdd} className="rounded-full bg-hb-navy px-4 py-1.5 text-sm font-bold text-white">
            + 학생 추가
          </button>
        </div>
      </div>
      {data.students.length === 0 ? (
        <p className="text-sm text-ink-soft">
          아직 등록된 학생이 없어요. &lsquo;여러 명 한 번에&rsquo;로 종이 시간표를 옮겨 적거나, 시간표의 빈 칸을 눌러 한 명씩 넣어 주세요.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.students.map((s) => {
            const reg = data.regular.filter((r) => r.studentId === s.id).sort((a, b) => a.weekday - b.weekday);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => onEdit(s)} className="w-full rounded-xl bg-bg-soft p-3 text-left hover:ring-1 hover:ring-hb-blue">
                  <p className="font-bold">
                    {s.name} {s.note && <span className="text-xs font-normal text-ink-soft">· {s.note}</span>}
                  </p>
                  <p className="text-xs text-ink-soft">{reg.length ? reg.map((r) => `${DAY_LABEL[r.weekday]} ${short(r.time)}${r.arrive ? `(${short(r.arrive)})` : ""}`).join(" · ") : "평소 등원 없음"}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
