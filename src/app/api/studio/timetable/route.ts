import { NextResponse, type NextRequest } from "next/server";
import { checkStudioRequest, errorResponse, fail } from "@/studio/request";
import {
  MAX_BULK,
  TimetableError,
  addVisit,
  bulkAdd,
  checkIn,
  cleanDuration,
  cleanName,
  cleanNote,
  fixWeek,
  getWeek,
  isTime,
  isWeekday,
  moveOnce,
  moveWeekly,
  normalizeWeek,
  removeRegularDay,
  removeStudent,
  restore,
  saveInfo,
  saveRows,
  saveStudent,
  skipOnce,
  timetableConfigured,
  undoCheckIn,
  type Weekday,
} from "@/studio/timetable";

const MAX_BODY_BYTES = 32 * 1024;

/** 아이들 이름이 오가므로 캐시 금지 */
const ok = (data: unknown) => NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });

type Slots = { weekday: Weekday; time: string; arrive: string | null }[];
/** 요일·시각 목록 검사 (요일 중복은 첫 번째만). 형식이 틀리면 null */
function slotsOf(v: unknown): Slots | null {
  const raw = Array.isArray(v) ? v.slice(0, 5) : [];
  const out: Slots = [];
  for (const s of raw as Record<string, unknown>[]) {
    if (!isWeekday(s?.weekday) || !isTime(s?.time)) return null;
    const arrive = s.arrive == null || s.arrive === "" ? null : isTime(s.arrive) ? s.arrive : undefined;
    if (arrive === undefined) return null;
    if (!out.some((x) => x.weekday === s.weekday)) out.push({ weekday: s.weekday, time: s.time, arrive });
  }
  return out;
}

/**
 * POST /api/studio/timetable — 읽기와 변경 모두 POST (출처·로그인 검사를 같은 규칙으로 하기 위해)
 * 변경은 한 요청 = 한 트랜잭션이고, 끝나면 그 주 시간표 전체를 돌려준다.
 *   getWeek { week }
 *   saveStudent { id?, name, note, duration, slots } · removeStudent { id } · bulkAdd { students: [{ name, slots }] }
 *   saveInfo { studentId, note, duration }   메모·수업시간(분)만 바꾸기
 *   checkIn / undoCheckIn { studentId }      오늘 출석! / 출석 취소
 *   moveOnce / moveWeekly { studentId, week, from, to, time }      이번 주만 / 매주 옮기기·시간 바꾸기
 *   addVisit { studentId, week, weekday, time, weekly }             빈 요일에 넣기
 *   skipOnce / restore / removeRegularDay { studentId, week, weekday }
 *   saveRows { rows } · fixWeek { week }   (이번 주 시간표를 앞으로 계속 쓰기)
 *   arrive(선택): 수업 시각과 다른 실제 도착 시각
 */
export async function POST(req: NextRequest) {
  const denied = checkStudioRequest(req);
  if (denied) return denied;
  if (!timetableConfigured()) return fail(503, "NOT_CONFIGURED", "시간표 저장소(DB)가 연결되지 않았습니다.");
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "INVALID_BODY", "요청 형식이 올바르지 않습니다.");
  const week = normalizeWeek(b.week);
  const sid = Number(b.studentId ?? b.id);
  const validId = Number.isInteger(sid) && sid > 0;
  const needStudent = () => (validId ? null : fail(400, "INVALID_ID", "학생을 찾을 수 없습니다."));
  const arrive = b.arrive == null || b.arrive === "" ? null : isTime(b.arrive) ? b.arrive : undefined;
  if (arrive === undefined) return fail(400, "INVALID_TIME", "도착 시간이 올바르지 않습니다 (오전 8시 ~ 오후 10시).");
  const duration = cleanDuration(b.duration);
  if (duration === undefined) return fail(400, "INVALID_DURATION", "수업시간이 올바르지 않습니다.");

  try {
    switch (b.action) {
      case "getWeek":
        break;
      case "saveStudent": {
        const name = cleanName(b.name);
        if (!name) return fail(400, "NAME_REQUIRED", "학생 이름을 적어 주세요.");
        const slots = slotsOf(b.slots);
        if (!slots) return fail(400, "INVALID_SLOT", "요일·시간이 올바르지 않습니다 (오전 8시 ~ 오후 10시).");
        await saveStudent({ id: validId ? sid : undefined, name, note: cleanNote(b.note), duration, slots });
        break;
      }
      case "saveInfo": {
        const bad = needStudent();
        if (bad) return bad;
        await saveInfo(sid, cleanNote(b.note), duration);
        break;
      }
      case "checkIn":
      case "undoCheckIn": {
        const bad = needStudent();
        if (bad) return bad;
        await (b.action === "checkIn" ? checkIn : undoCheckIn)(sid);
        break;
      }
      case "removeStudent": {
        const bad = needStudent();
        if (bad) return bad;
        await removeStudent(sid);
        break;
      }
      case "bulkAdd": {
        const list = Array.isArray(b.students) ? (b.students as Record<string, unknown>[]) : [];
        if (list.length > MAX_BULK) return fail(400, "TOO_MANY", `한 번에 ${MAX_BULK}명까지 등록할 수 있어요. 나눠서 등록해 주세요.`);
        const items: { name: string; slots: Slots }[] = [];
        for (const [i, it] of list.entries()) {
          const name = cleanName(it?.name);
          const slots = slotsOf(it?.slots);
          if (!name || !slots) return fail(400, "INVALID_ROW", `${i + 1}번째 줄의 이름이나 요일·시간을 확인해 주세요.`);
          items.push({ name, slots });
        }
        if (!items.length) return fail(400, "NOTHING_TO_ADD", "등록할 학생이 없습니다.");
        await bulkAdd(items);
        break;
      }
      case "moveOnce":
      case "moveWeekly": {
        const bad = needStudent();
        if (bad) return bad;
        if (!isWeekday(b.from) || !isWeekday(b.to) || !isTime(b.time)) return fail(400, "INVALID_SLOT", "요일·시간이 올바르지 않습니다 (오전 8시 ~ 오후 10시).");
        await (b.action === "moveOnce" ? moveOnce : moveWeekly)(sid, week, b.from, b.to, b.time, arrive);
        break;
      }
      case "addVisit": {
        const bad = needStudent();
        if (bad) return bad;
        if (!isWeekday(b.weekday) || !isTime(b.time)) return fail(400, "INVALID_SLOT", "요일·시간이 올바르지 않습니다 (오전 8시 ~ 오후 10시).");
        await addVisit(sid, week, b.weekday, b.time, b.weekly === true, arrive);
        break;
      }
      case "skipOnce":
      case "restore":
      case "removeRegularDay": {
        const bad = needStudent();
        if (bad) return bad;
        if (!isWeekday(b.weekday)) return fail(400, "INVALID_SLOT", "요일이 올바르지 않습니다.");
        await { skipOnce, restore, removeRegularDay }[b.action](sid, week, b.weekday);
        break;
      }
      case "fixWeek":
        await fixWeek(week);
        break;
      case "saveRows": {
        const rows = Array.isArray(b.rows) ? b.rows.filter(isTime) : [];
        await saveRows(rows);
        break;
      }
      default:
        return fail(400, "INVALID_ACTION", "알 수 없는 요청입니다.");
    }
    return ok(await getWeek(week));
  } catch (e) {
    if (e instanceof TimetableError) return fail(e.status, e.code, e.message);
    return errorResponse(e);
  }
}
