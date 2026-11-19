"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  CELLS,
  SIZE,
  START,
  START_HEARTS,
  cellOf,
  colOf,
  rowOf,
  answer,
  canMove,
  isOasis,
  move,
  newGame,
  scope,
  sensor,
  stars,
  type Cell,
  type Game,
  type Level,
  type Question,
} from "@/game/trap/engine";
import { BANKS, LEVEL_INFO } from "@/game/trap/questions";

/* ───────── 최고 점수 (브라우저에만, 실패해도 게임은 그대로) ───────── */
const BEST_KEY = "hb-safari-best";
let bestCache: string | null = null;
const listeners = new Set<() => void>();
function readBest() {
  try {
    bestCache = localStorage.getItem(BEST_KEY);
  } catch {
    bestCache = null;
  }
  return bestCache;
}
const LEVELS: Level[] = ["phonics", "elementary", "middle"];
/** 저장값이 깨져 있어도(예: "null", 배열, 문자열 점수) 게임이 멈추지 않게 레벨별 0 이상의 정수만 받는다 */
function parseBest(raw: string | null): Partial<Record<Level, number>> {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Partial<Record<Level, number>> = {};
  for (const l of LEVELS) {
    const v = (data as Record<string, unknown>)[l];
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) out[l] = v;
  }
  return out;
}
function saveBest(level: Level, score: number) {
  const cur = parseBest(readBest());
  if ((cur[level] ?? -1) >= score) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ ...cur, [level]: score }));
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Review = { q: Question; choice: number; right: boolean };
type Feedback = Review & { lostAfter: boolean; at: number };
/** 해설이 뜬 직후 이 시간 안의 "계속" 입력은 무시 (Enter 를 누른 채 답해 해설을 건너뛰지 않게) */
const FEEDBACK_HOLD_MS = 450;
/** 문제·결과 창이 닫힌 뒤 포커스를 돌려줄 곳 (키보드로 계속 플레이) */
const RETURN_FOCUS = '[aria-label="방향 버튼"] button:not(:disabled)';

/** 방문 칸 숫자색 — 두 모래색 배경 모두에서 대비 4.5:1 이상 */
const NUM_COLOR = ["", "#0a4f8f", "#14632c", "#a3361a", "#7f1d1d", "#5b1647", "#5b1647", "#5b1647", "#5b1647"];
/** 센서 원 배경색 (흰 글자) */
const DOT_COLOR = ["#3f8a2a", "#0a4f8f", "#14632c", "#a3361a", "#7f1d1d", "#5b1647", "#5b1647", "#5b1647", "#5b1647"];

/** 8방향 이동 (방향 버튼·방향키) */
const DIRS: { dr: number; dc: number; arrow: string; name: string }[] = [
  { dr: -1, dc: -1, arrow: "↖", name: "왼쪽 위로" },
  { dr: -1, dc: 0, arrow: "↑", name: "위로" },
  { dr: -1, dc: 1, arrow: "↗", name: "오른쪽 위로" },
  { dr: 0, dc: -1, arrow: "←", name: "왼쪽으로" },
  { dr: 0, dc: 1, arrow: "→", name: "오른쪽으로" },
  { dr: 1, dc: -1, arrow: "↙", name: "왼쪽 아래로" },
  { dr: 1, dc: 0, arrow: "↓", name: "아래로" },
  { dr: 1, dc: 1, arrow: "↘", name: "오른쪽 아래로" },
];
const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};
const target = (pos: Cell, dr: number, dc: number): Cell | null => {
  const r = rowOf(pos) + dr;
  const c = colOf(pos) + dc;
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? cellOf(r, c) : null;
};

export default function TrapGame({ bookingUrl }: { bookingUrl: string }) {
  const [game, setGame] = useState<Game | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bump, setBump] = useState(0); // 오답 시 화면 흔들기
  const best = parseBest(useSyncExternalStore(subscribe, readBest, () => null));
  // 보기를 빠르게 두 번 눌러도 답이 한 번만 처리되게 (렌더 전 연속 클릭 방지)
  const answering = useRef(false);

  function start(level: Level) {
    setGame(newGame(level));
    setFeedback(null);
    setReviews([]);
  }

  function step(cell: Cell) {
    if (!game || feedback || !canMove(game, cell)) return;
    const next = move(game, cell, BANKS[game.level]);
    if (next.status === "quiz") answering.current = false;
    setGame(next);
    if (next.status === "won") saveBest(next.level, next.score);
  }

  // 방향키 이동 (문제·결과 창이 없을 때만). 대각선은 방향 버튼으로
  const live = useRef({ game, feedback, step });
  useEffect(() => {
    live.current = { game, feedback, step };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = KEY_DIR[e.key];
      const { game: g, feedback: f, step: go } = live.current;
      if (!d || !g || f || g.status !== "play") return;
      // 게임 영역(보드·방향 버튼)이나 빈 곳에 포커스가 있을 때만 — 링크·'게임 방법' 등을 조작 중이면 방향키는 원래대로
      const el = document.activeElement;
      if (el && el !== document.body && !el.closest("[data-game-area]")) return;
      const t = target(g.pos, d[0], d[1]);
      if (t === null) return;
      e.preventDefault();
      go(t);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function choose(choice: number) {
    if (!game?.quiz || feedback || answering.current) return;
    answering.current = true;
    const bank = BANKS[game.level];
    const q = bank.find((x) => x.id === game.quiz!.questionId)!;
    const next = answer(game, choice, bank);
    const right = choice === q.answer;
    setReviews((r) => [...r, { q, choice, right }]);
    setFeedback({ q, choice, right, lostAfter: next.status === "lost", at: Date.now() });
    if (!right) setBump((b) => b + 1);
    setGame(next);
  }

  if (!game) return <Intro onStart={start} best={best} />;

  const bank = BANKS[game.level];
  const quizQ = game.quiz ? bank.find((x) => x.id === game.quiz!.questionId) : null;
  const ended = (game.status === "won" || game.status === "lost") && !feedback;
  const near = sensor(game);

  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 pt-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      {/* ── 보드 ── */}
      <div key={bump} className={bump ? "anim-shake" : ""} data-game-area>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xl" aria-label={`하트 ${game.hearts}개`}>
            {Array.from({ length: START_HEARTS }, (_, i) => (
              <span key={i} className={i < game.hearts ? "" : "opacity-25 grayscale"}>
                ❤️
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Chip>{LEVEL_INFO[game.level].emoji} {LEVEL_INFO[game.level].label}</Chip>
            <Chip>
              <b className="tabular-nums">{game.score}</b>점
            </Chip>
          </div>
        </div>

        <div className="rounded-[28px] bg-[#b9773e] p-2.5 shadow-[0_10px_0_#8a5426,0_18px_30px_rgb(0_0_0/0.18)] sm:p-3">
          <div
            className="grid aspect-square gap-[3px] overflow-hidden rounded-[20px] bg-[#7b4a22] p-[3px]"
            style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gridTemplateRows: "repeat(8, minmax(0, 1fr))" }}
            role="group"
            aria-label="사파리 보드 8×8 — 아래 방향 버튼이나 방향키로도 움직일 수 있어요"
          >
            {Array.from({ length: CELLS }, (_, cell) => (
              <Tile key={cell} cell={cell} game={game} onStep={step} />
            ))}
          </div>
        </div>

        {/* 센서 · 안내 + 방향 버튼 (작은 화면에서 칸을 잘못 누르지 않게 크게) */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/85 p-3 ring-1 ring-[#e9d8ac] backdrop-blur">
          <DirPad game={game} disabled={!!feedback} onStep={step} near={near} />
          <p className="min-w-0 flex-1 text-sm leading-5" aria-live="polite">
            {game.status === "play" ? (
              near === 0 ? (
                <>
                  <b>주변 8칸에 덫이 없어요!</b> 마음 놓고 움직여요.
                </>
              ) : (
                <>
                  <b>주변 8칸에 덫이 {near}개</b> 숨어 있어요. 숫자를 보고 길을 골라요.
                </>
              )
            ) : game.status === "quiz" ? (
              "잠깐! 문제를 풀어 덫을 치워요."
            ) : game.status === "won" ? (
              "오아시스에 도착했어요! 🎉"
            ) : (
              "하트를 모두 썼어요. 다시 도전해 봐요!"
            )}
          </p>
        </div>
      </div>

      {/* ── 옆 패널 ── */}
      <aside className="space-y-3">
        <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-[#e9d8ac] backdrop-blur">
          <p className="font-round text-lg text-[#7b4a22]">🔭 망원경</p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">지금 자리 주변 5×5 칸의 덫을 한 번 보여 줘요. 한 판에 한 번!</p>
          <button
            type="button"
            onClick={() => setGame(scope(game))}
            disabled={game.status !== "play" || game.scopeLeft <= 0}
            className="mt-3 w-full rounded-full bg-[#7b4a22] py-2.5 text-sm font-extrabold text-white shadow-[0_3px_0_#4d2c10] transition active:translate-y-[2px] active:shadow-none disabled:opacity-40"
          >
            {game.scopeLeft > 0 ? "망원경 쓰기 (1번 남음)" : "망원경을 썼어요"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="움직임" value={game.moves} />
          <Stat label="정답" value={game.correct} />
          <Stat label="남은 덫" value={game.traps.length} />
        </div>
        <details className="rounded-2xl bg-white/85 p-4 text-sm leading-6 ring-1 ring-[#e9d8ac] backdrop-blur">
          <summary className="cursor-pointer font-round text-[#7b4a22]">게임 방법</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
            <li>노란 테두리 칸이나 방향 버튼을 눌러 한 칸씩 움직여요 (대각선도 OK, 키보드는 방향키).</li>
            <li>밟은 칸의 숫자 = 그 주변 8칸에 숨은 덫의 수.</li>
            <li>덫을 밟으면 영어 문제! 답하면 덫은 사라지고, 맞히면 +3점, 틀리면 ❤️ 하나.</li>
            <li>오른쪽 위 오아시스 🌴에 도착하면 승리! 남은 하트도 점수가 돼요.</li>
          </ul>
        </details>
        <button type="button" onClick={() => setGame(null)} className="w-full text-sm font-bold text-ink-soft underline">
          레벨 다시 고르기
        </button>
      </aside>

      {/* ── 문제 ── */}
      {(game.status === "quiz" || feedback) && (
        <Modal labelledBy="quiz-title">
          {feedback ? (
            <div className="anim-pop">
              <p id="quiz-title" className={`font-display text-3xl ${feedback.right ? "text-[#14632c]" : "text-[#a3361a]"}`}>
                {feedback.right ? "정답! 덫을 치웠어요 ✨" : "아쉬워요! ❤️ −1"}
              </p>
              {!feedback.right && <p className="mt-1 text-sm text-ink-soft">덫은 사라졌어요. 정답을 기억해 두세요!</p>}
              <p className="mt-3 rounded-xl bg-[#fff7e0] p-3 text-sm leading-6">
                <b>정답: {feedback.q.choices[feedback.q.answer - 1]}</b>
                <br />
                {feedback.q.explanation}
              </p>
              <button
                type="button"
                autoFocus
                onKeyDown={(e) => {
                  if (e.repeat) e.preventDefault();
                }}
                onClick={() => {
                  if (Date.now() - feedback.at < FEEDBACK_HOLD_MS) return;
                  setFeedback(null);
                }}
                className="mt-4 w-full rounded-full bg-hb-navy py-3.5 font-extrabold text-white shadow-[0_4px_0_#00317a] active:translate-y-[2px] active:shadow-none"
              >
                {feedback.lostAfter ? "결과 보기" : "계속 가기 →"}
              </button>
            </div>
          ) : (
            quizQ && (
              <div className="anim-pop">
                <p className="font-round text-sm text-[#a3361a]">🪤 덫을 밟았어요! 답하면 덫이 사라져요 · 맞히면 +3점, 틀리면 ❤️ −1</p>
                <p id="quiz-title" tabIndex={-1} className="mt-2 font-display text-2xl leading-snug text-ink outline-none sm:text-[1.7rem]">
                  {quizQ.question}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {quizQ.choices.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => choose(i + 1)}
                      className="flex items-center gap-3 rounded-2xl border-2 border-[#e9d8ac] bg-white px-4 py-3 text-left text-[17px] font-bold transition hover:border-hb-blue hover:bg-bg-soft active:scale-[0.98]"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#fff1c2] font-round text-sm text-[#7b4a22]">
                        {i + 1}
                      </span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </Modal>
      )}

      {/* ── 결과 ── */}
      {ended && (
        <Modal labelledBy="result-title">
          <Result game={game} reviews={reviews} best={best[game.level]} bookingUrl={bookingUrl} onRetry={() => start(game.level)} onLevels={() => setGame(null)} />
        </Modal>
      )}
    </div>
  );
}

/* ───────── 칸 ───────── */
function Tile({ cell, game, onStep }: { cell: Cell; game: Game; onStep: (c: Cell) => void }) {
  const here = game.pos === cell;
  const reachable = canMove(game, cell);
  const visited = game.visited.includes(cell);
  const oasis = isOasis(cell);
  const cleared = game.cleared.includes(cell);
  const spotted = game.spotted.includes(cell);
  const n = visited && !oasis ? sensor(game, cell) : 0;
  const checker = (Math.floor(cell / 8) + (cell % 8)) % 2 === 0;

  const bg = oasis
    ? "bg-[#3fb3e6] anim-ripple bg-[radial-gradient(circle_at_30%_30%,rgb(255_255_255/0.45)_0_2px,transparent_3px)] [background-size:14px_10px]"
    : visited
      ? checker
        ? "bg-[#f6e3b1]"
        : "bg-[#f1dba3]"
      : checker
        ? "bg-[#8fcf6b] bg-[radial-gradient(circle_at_25%_70%,#79b957_0_1.5px,transparent_2px),radial-gradient(circle_at_70%_35%,#79b957_0_1.5px,transparent_2px)]"
        : "bg-[#84c561] bg-[radial-gradient(circle_at_60%_70%,#6eae4d_0_1.5px,transparent_2px),radial-gradient(circle_at_30%_30%,#6eae4d_0_1.5px,transparent_2px)]";

  const r = rowOf(cell);
  const c = colOf(cell);
  const dir = DIRS.find((d) => rowOf(game.pos) + d.dr === r && colOf(game.pos) + d.dc === c);
  const label = here
    ? "지금 위치"
    : oasis
      ? "오아시스"
      : spotted
        ? "망원경으로 찾은 덫"
        : visited
          ? `지나온 칸, 주변 덫 ${n}개`
          : "풀숲";

  return (
    <button
      type="button"
      aria-label={`${r + 1}행 ${c + 1}열, ${label}${reachable && dir ? ` — ${dir.name} 이동` : ""}`}
      disabled={!reachable}
      onClick={() => onStep(cell)}
      className={`relative grid place-items-center rounded-[6px] text-[clamp(14px,4.4vw,26px)] leading-none transition-transform ${bg} ${
        reachable ? "anim-ring cursor-pointer hover:scale-[1.06] hover:z-10" : "cursor-default"
      }`}
    >
      {oasis && cell === 6 && <span aria-hidden>🌴</span>}
      {oasis && cell === 15 && <span aria-hidden>💧</span>}
      {!here && cell === START && !oasis && <span aria-hidden className="opacity-70">🚩</span>}
      {!here && visited && !oasis && cell !== START && n > 0 && (
        <span className="font-round" style={{ color: NUM_COLOR[n] }} aria-hidden>
          {n}
        </span>
      )}
      {!here && cleared && (
        <span aria-hidden className="absolute bottom-0.5 right-1 text-[10px] opacity-80">
          ✨
        </span>
      )}
      {!here && spotted && !visited && (
        <span aria-hidden className="grid size-[70%] place-items-center rounded-full bg-[#e0663d]/90 text-[0.7em] text-white shadow">
          !
        </span>
      )}
      {here && (
        <span aria-hidden className="anim-hop drop-shadow-[0_3px_0_rgb(0_0_0/0.2)]">
          🦁
        </span>
      )}
    </button>
  );
}

/* ───────── 시작 화면 ───────── */
function Intro({ onStart, best }: { onStart: (l: Level) => void; best: Partial<Record<Level, number>> }) {
  const levels: Level[] = ["phonics", "elementary", "middle"];
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="relative overflow-hidden rounded-[32px] bg-[#fff6dc] px-6 pb-8 pt-10 ring-1 ring-[#efdcaa] sm:px-10">
        <div className="pointer-events-none absolute -right-6 bottom-0 hidden w-40 sm:block">
          <Image src="/brand/girl.png" alt="" width={300} height={420} className="h-auto w-full" />
        </div>
        <p className="font-round text-hb-blue">스마트해법영어 백운밸리점 · 영어 놀이터</p>
        <h1 className="mt-2 font-display text-[2.6rem] leading-[1.05] text-[#7b4a22] sm:text-6xl">
          단어 사파리
          <span className="mt-2 block text-2xl text-ink sm:text-3xl">🦁 덫을 피해 오아시스까지!</span>
        </h1>
        <ol className="mt-6 grid max-w-xl gap-2 text-sm sm:grid-cols-3">
          {[
            ["👣", "한 칸씩 이동", "대각선도 갈 수 있어요"],
            ["🔢", "숫자 = 주변 덫", "숫자를 보고 길을 골라요"],
            ["🪤", "덫엔 영어 퀴즈", "답하면 덫이 사라져요"],
          ].map(([e, t, d]) => (
            <li key={t} className="rounded-2xl bg-white/80 p-3 ring-1 ring-[#efdcaa]">
              <p className="text-xl">{e}</p>
              <p className="mt-1 font-extrabold">{t}</p>
              <p className="text-xs text-ink-soft">{d}</p>
            </li>
          ))}
        </ol>
      </div>

      <h2 className="mt-8 font-round text-xl text-[#7b4a22]">레벨을 골라 출발!</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {levels.map((l, i) => (
          <button
            key={l}
            type="button"
            onClick={() => onStart(l)}
            className="anim-pop group rounded-3xl bg-white p-5 text-left ring-2 ring-[#efdcaa] transition hover:-translate-y-1 hover:ring-hb-blue"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="text-4xl">{LEVEL_INFO[l].emoji}</span>
            <p className="mt-3 font-display text-2xl text-ink">{LEVEL_INFO[l].label}</p>
            <p className="text-sm text-ink-soft">{LEVEL_INFO[l].sub}</p>
            <p className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-soft">{best[l] != null ? `최고 ${best[l]}점` : "아직 기록 없음"}</span>
              <span className="rounded-full bg-hb-yellow px-3 py-1 font-extrabold text-ink transition group-hover:bg-hb-navy group-hover:text-white">
                출발 →
              </span>
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────── 결과 ───────── */
function Result({
  game,
  reviews,
  best,
  bookingUrl,
  onRetry,
  onLevels,
}: {
  game: Game;
  reviews: Review[];
  best?: number;
  bookingUrl: string;
  onRetry: () => void;
  onLevels: () => void;
}) {
  const won = game.status === "won";
  const s = stars(game);
  const wrong = reviews.filter((r) => !r.right);
  return (
    <div className="anim-pop text-center">
      <p className="text-5xl">{won ? "🌴" : "🌵"}</p>
      <p id="result-title" tabIndex={-1} className="mt-2 font-display text-3xl text-[#7b4a22] outline-none">
        {won ? "오아시스 도착!" : "하트를 모두 썼어요"}
      </p>
      {won && (
        <p className="mt-2 text-3xl tracking-widest" aria-label={`별 ${s}개`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= s ? "" : "opacity-20 grayscale"}>
              ⭐
            </span>
          ))}
        </p>
      )}
      <p className="mt-3 font-display text-5xl tabular-nums text-ink">
        {game.score}
        <span className="ml-1 text-xl">점</span>
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        정답 {game.correct} · 오답 {game.wrong} · 움직임 {game.moves}
        {best != null && ` · 이 레벨 최고 ${best}점`}
      </p>

      {wrong.length > 0 && (
        <div className="mt-4 rounded-2xl bg-[#fff7e0] p-3 text-left text-sm">
          <p className="font-bold text-[#7b4a22]">📒 다시 볼 문제</p>
          <ul className="mt-1 space-y-1.5">
            {wrong.map((r) => (
              <li key={r.q.id} className="leading-5">
                {r.q.question} → <b>{r.q.choices[r.q.answer - 1]}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onRetry} className="rounded-full bg-hb-navy py-3 font-extrabold text-white shadow-[0_4px_0_#00317a] active:translate-y-[2px] active:shadow-none">
          다시 하기
        </button>
        <button type="button" onClick={onLevels} className="rounded-full border-2 border-[#efdcaa] bg-white py-3 font-extrabold text-ink">
          다른 레벨
        </button>
      </div>
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block rounded-2xl bg-hb-yellow px-4 py-3.5 text-sm font-extrabold text-ink"
      >
        우리 아이 진짜 영어 레벨이 궁금하다면?
        <span className="block text-base">무료 레벨테스트 예약하기 →</span>
      </a>
    </div>
  );
}

/* ───────── 작은 조각 ───────── */
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/90 px-3 py-1 text-sm ring-1 ring-[#e9d8ac]">{children}</span>;
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/85 py-2 ring-1 ring-[#e9d8ac]">
      <p className="font-display text-2xl tabular-nums text-ink">{value}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}
/**
 * 문제·결과 창: 네이티브 <dialog>.showModal() — 뒤쪽 화면은 자동으로 조작·포커스 불가(inert),
 * 창이 열리면 첫 버튼으로 포커스, 닫히면 원래 자리로 돌아간다. Esc로 닫히지 않게 막는다(답을 골라야 진행).
 */
function Modal({ children, labelledBy }: { children: React.ReactNode; labelledBy: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // React 는 <p> 의 autoFocus 를 처리하지 않으므로 직접: 창 안 autofocus 버튼(해설의 '계속') → 없으면 제목(질문)
    (d.querySelector<HTMLElement>("[autofocus]") ?? document.getElementById(labelledBy))?.focus();
    return () => {
      if (d.open) d.close();
      // 닫힌 뒤 보드 쪽으로 포커스를 돌려 키보드로 이어서 플레이
      requestAnimationFrame(() => document.querySelector<HTMLElement>(RETURN_FOCUS)?.focus());
    };
  }, [labelledBy]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => e.preventDefault()}
      className="m-0 mx-auto mb-3 mt-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-auto rounded-[28px] bg-white p-5 shadow-2xl backdrop:bg-[#2b1a0a]/45 backdrop:backdrop-blur-[2px] sm:my-auto sm:p-6"
    >
      {children}
    </dialog>
  );
}

/* ───────── 방향 버튼 (어린이 손가락에 맞춘 48px, 가운데는 센서 숫자) ───────── */
function DirPad({ game, disabled, onStep, near }: { game: Game; disabled: boolean; onStep: (c: Cell) => void; near: number }) {
  const cells = [...DIRS.slice(0, 4), null, ...DIRS.slice(4)];
  return (
    <div className="grid shrink-0 grid-cols-3 gap-1" role="group" aria-label="방향 버튼">
      {cells.map((d, i) => {
        if (!d) {
          return (
            <span
              key="center"
              className="grid size-12 place-items-center rounded-full font-round text-2xl text-white"
              style={{ background: DOT_COLOR[Math.min(near, 8)] }}
              aria-label={`주변 덫 ${near}개`}
            >
              {near}
            </span>
          );
        }
        const t = target(game.pos, d.dr, d.dc);
        const ok = !disabled && t !== null && canMove(game, t);
        return (
          <button
            key={i}
            type="button"
            disabled={!ok}
            onClick={() => t !== null && onStep(t)}
            aria-label={`${d.name} 이동`}
            className="grid size-12 place-items-center rounded-xl bg-[#fff1c2] text-xl font-bold text-[#7b4a22] shadow-[0_3px_0_#e2c879] transition active:translate-y-[2px] active:shadow-none disabled:opacity-30 disabled:shadow-none"
          >
            {d.arrow}
          </button>
        );
      })}
    </div>
  );
}
