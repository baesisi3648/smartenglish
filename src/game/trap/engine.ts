/**
 * 단어 사파리 — 혼자 하는 덫 피하기 규칙 엔진 (순수 함수, 입력 상태를 바꾸지 않고 새 상태를 돌려준다).
 *
 * 원본: gamify-class/apps/animal-trap/src/game (board.ts · questions.ts · rules.ts) 의 규칙을
 * 홈페이지용 1인 미니판으로 줄였다.
 *   - 16×16 → 8×8, 4~8팀 → 혼자, 실시간 서버 → 브라우저 안에서만
 *   - 유지: 8방향 1칸 이동, 숨은 덫, 덫을 밟으면 문제(맞히면 덫 제거), 주변 덫 센서, 정찰(망원경) 1회
 *   - 변경: 출발은 왼쪽 아래, 오아시스는 오른쪽 위 2×2 / 하트 3개(오답 시 −1) / 점수는 아래 상수
 */

export const SIZE = 8;
export const CELLS = SIZE * SIZE;
export const TRAP_COUNT = 12;
export const START_HEARTS = 3;

export type Cell = number;
export type Level = "phonics" | "elementary" | "middle";
export type Status = "play" | "quiz" | "won" | "lost";

export const cellOf = (r: number, c: number): Cell => r * SIZE + c;
export const rowOf = (cell: Cell) => Math.floor(cell / SIZE);
export const colOf = (cell: Cell) => cell % SIZE;
const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const isCell = (v: unknown): v is Cell => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CELLS;

const DIRS: readonly [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export function neighbors(cell: Cell): Cell[] {
  const r = rowOf(cell);
  const c = colOf(cell);
  const out: Cell[] = [];
  for (const [dr, dc] of DIRS) if (inBoard(r + dr, c + dc)) out.push(cellOf(r + dr, c + dc));
  return out;
}
export const isNeighbor = (a: Cell, b: Cell) => a !== b && Math.abs(rowOf(a) - rowOf(b)) <= 1 && Math.abs(colOf(a) - colOf(b)) <= 1;

export const START: Cell = cellOf(SIZE - 1, 0);
export const OASIS: readonly Cell[] = [cellOf(0, SIZE - 2), cellOf(0, SIZE - 1), cellOf(1, SIZE - 2), cellOf(1, SIZE - 1)];
export const isOasis = (cell: Cell) => OASIS.includes(cell);
/** 오아시스까지 최소 이동 횟수 (8방향 = 체비셰프 거리) */
export const movesToOasis = (cell: Cell) =>
  Math.min(...OASIS.map((o) => Math.max(Math.abs(rowOf(o) - rowOf(cell)), Math.abs(colOf(o) - colOf(cell)))));

/** 점수 (원본: 안전 칸 최초 방문 +1, 정답 = 덫 수 + 2 → 덫 1개 기준 +3) */
export const SAFE_POINTS = 1;
export const CORRECT_POINTS = 3;
export const OASIS_POINTS = 10;
export const HEART_POINTS = 5;

export type Question = {
  id: string;
  question: string;
  choices: [string, string, string, string];
  /** 정답 번호 1~4 (애니멀 트랩·더비 문제 파일과 같은 형식) */
  answer: 1 | 2 | 3 | 4;
  explanation: string;
};

export type Game = {
  level: Level;
  pos: Cell;
  /** 아직 남아 있는 덫 */
  traps: Cell[];
  /** 밟아서 치운 덫 (정답·오답 모두) */
  cleared: Cell[];
  visited: Cell[];
  hearts: number;
  score: number;
  moves: number;
  correct: number;
  wrong: number;
  /** 망원경(정찰) 1회 — 쓰면 지금 위치 주변 5×5 의 덫을 표시 */
  scopeLeft: number;
  spotted: Cell[];
  asked: string[];
  status: Status;
  /** 덫을 밟아 풀고 있는 문제 */
  quiz: { cell: Cell; questionId: string } | null;
};

export type Rng = () => number;

function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 덫은 출발 칸·출발 칸 바로 옆·오아시스에는 놓지 않는다 (첫 걸음에 바로 걸리지 않게) */
export function newGame(level: Level, rng: Rng = Math.random, trapCount = TRAP_COUNT): Game {
  const banned = new Set<Cell>([START, ...neighbors(START), ...OASIS]);
  const candidates = Array.from({ length: CELLS }, (_, i) => i).filter((c) => !banned.has(c));
  return {
    level,
    pos: START,
    traps: shuffle(candidates, rng).slice(0, trapCount).sort((a, b) => a - b),
    cleared: [],
    visited: [START],
    hearts: START_HEARTS,
    score: 0,
    moves: 0,
    correct: 0,
    wrong: 0,
    scopeLeft: 1,
    spotted: [],
    asked: [],
    status: "play",
    quiz: null,
  };
}

/** 주변 8칸에 남은 덫 수 (원본의 덫 센서) */
export function sensor(game: Game, cell: Cell = game.pos): number {
  return neighbors(cell).filter((n) => game.traps.includes(n)).length;
}

export function canMove(game: Game, to: unknown): to is Cell {
  return game.status === "play" && isCell(to) && isNeighbor(game.pos, to);
}

/**
 * 문제 고르기 (원본 questions.ts pickQuestion): 이번 판에 안 낸 문제 중 무작위,
 * 다 썼으면 가장 오래전에 낸 것부터 다시.
 */
export function pickQuestion(bank: readonly Question[], asked: readonly string[], rng: Rng = Math.random): Question {
  if (!bank.length) throw new Error("EMPTY_BANK");
  const fresh = bank.filter((q) => !asked.includes(q.id));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
  return [...bank].sort((a, b) => asked.indexOf(a.id) - asked.indexOf(b.id))[0];
}

/** 이웃 칸으로 1칸 이동. 덫이면 문제 단계, 오아시스면 승리, 처음 밟는 안전 칸이면 +1 */
export function move(game: Game, to: Cell, bank: readonly Question[], rng: Rng = Math.random): Game {
  if (!canMove(game, to)) return game;
  const firstVisit = !game.visited.includes(to);
  const next: Game = {
    ...game,
    pos: to,
    moves: game.moves + 1,
    visited: firstVisit ? [...game.visited, to] : game.visited,
  };
  if (game.traps.includes(to)) {
    const q = pickQuestion(bank, game.asked, rng);
    return { ...next, status: "quiz", quiz: { cell: to, questionId: q.id }, asked: [...game.asked, q.id] };
  }
  if (isOasis(to)) {
    return { ...next, status: "won", score: game.score + OASIS_POINTS + game.hearts * HEART_POINTS };
  }
  return firstVisit ? { ...next, score: game.score + SAFE_POINTS } : next;
}

/** 문제에 답함: 맞히면 +3, 틀리면 하트 −1. 어느 쪽이든 그 덫은 치운다 (같은 덫에 두 번 걸리지 않게) */
export function answer(game: Game, choice: number, bank: readonly Question[]): Game {
  if (game.status !== "quiz" || !game.quiz) return game;
  const q = bank.find((x) => x.id === game.quiz!.questionId);
  const right = !!q && choice === q.answer;
  const cell = game.quiz.cell;
  const hearts = right ? game.hearts : game.hearts - 1;
  return {
    ...game,
    traps: game.traps.filter((t) => t !== cell),
    cleared: [...game.cleared, cell],
    spotted: game.spotted.filter((s) => s !== cell),
    score: right ? game.score + CORRECT_POINTS : game.score,
    correct: game.correct + (right ? 1 : 0),
    wrong: game.wrong + (right ? 0 : 1),
    hearts,
    status: hearts <= 0 ? "lost" : "play",
    quiz: null,
  };
}

/** 망원경: 지금 위치 주변 2칸(5×5) 안의 덫 위치를 보여 준다. 판마다 1번 */
export function scope(game: Game): Game {
  if (game.status !== "play" || game.scopeLeft <= 0) return game;
  const r0 = rowOf(game.pos);
  const c0 = colOf(game.pos);
  const seen = game.traps.filter((t) => Math.abs(rowOf(t) - r0) <= 2 && Math.abs(colOf(t) - c0) <= 2);
  return { ...game, scopeLeft: game.scopeLeft - 1, spotted: [...new Set([...game.spotted, ...seen])] };
}

/** 별 개수 (끝난 판): 도착 + 하트·점수 기준 */
export function stars(game: Game): 0 | 1 | 2 | 3 {
  if (game.status !== "won") return 0;
  if (game.hearts === START_HEARTS && game.wrong === 0) return 3;
  return game.hearts >= 2 ? 2 : 1;
}
