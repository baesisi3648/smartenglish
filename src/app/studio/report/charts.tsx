"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyPoint, MonthPoint, Share } from "@/studio/report-data";

/** 한 가지 색(브랜드 파랑)만 쓰는 차트들 — 값은 글자색(ink)으로, 색은 막대·선에만 */
const BLUE = "#0689d7";
const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 일별 조회수 추이: 선 + 옅은 면, 글 올린 날 점, 마우스를 올리면 그날 값 */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // 실제 너비에 맞춰 그려 글자 크기가 화면에 따라 커지거나 작아지지 않게
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 180 : 220;
  const every = W < 500 ? 21 : 14;
  const P = { t: 12, r: 8, b: 26, l: 34 };
  const max = Math.ceil(Math.max(...data.map((d) => d.views)) / 10) * 10;
  const x = (i: number) => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.views).toFixed(1)}`).join("");
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, max / 2, max];
  const h = hover !== null ? data[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`최근 ${data.length}일 일별 조회수`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#e3e8ef" strokeWidth={1} />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#5f6675">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          (i % every === 0 && data.length - 1 - i >= every / 2) || i === data.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="#5f6675"
            >
              {d.label.replace(/\(.\)/, "")}
            </text>
          ) : null,
        )}
        <path d={area} fill={BLUE} opacity={0.1} />
        <path d={line} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) =>
          d.post ? <circle key={d.date} cx={x(i)} cy={y(d.views)} r={4.5} fill={BLUE} stroke="#fff" strokeWidth={2} /> : null,
        )}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={y(0)} stroke="#1f2430" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.views)} r={5} fill={BLUE} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-5 text-white shadow-lg"
          style={{ left: `${Math.min(82, Math.max(18, (x(hover) / W) * 100))}%` }}
        >
          <p className="font-bold">{h.label}</p>
          <p>조회 {fmt(h.views)}회</p>
          {h.post && <p className="max-w-56 text-hb-yellow">● {h.post}</p>}
        </div>
      )}
    </div>
  );
}

/** 월별 조회수 세로 막대. 진행 중인 달은 테두리만. 마우스를 올리면 순방문자수도 */
export function MonthlyBars({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.views));
  const h = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="flex h-44 items-end gap-[2px] border-b border-line sm:gap-1">
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
            aria-label={`${d.label} 조회수 ${d.views}회${d.visitors !== undefined ? `, 순방문자 ${d.visitors}명` : ""}${d.partial ? " (22일까지)" : ""}`}
          >
            <span className="mb-0.5 text-center text-[10px] font-bold tabular-nums text-ink sm:text-[11px]">{d.views}</span>
            <span
              className="block w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
              style={{
                height: `${(d.views / max) * 100}%`,
                background: d.partial ? "#fff" : BLUE,
                border: d.partial ? `2px solid ${BLUE}` : undefined,
                borderBottom: "none",
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] sm:gap-1">
        {data.map((d, i) => (
          <span key={d.label} className="min-w-0 flex-1 text-center text-[10px] text-ink-soft sm:text-[11px]">
            {i === 0 || d.label.endsWith(".01") ? d.label : d.label.slice(3)}
          </span>
        ))}
      </div>
      <p className="mt-2 min-h-5 text-xs text-ink-soft">
        {h
          ? `${h.label} · 조회 ${h.views}회${h.visitors !== undefined ? ` · 순방문자 ${h.visitors}명${h.visitorsApprox ? "(대략)" : ""}` : ""}${h.partial ? " (11월 22일까지)" : ""}`
          : "막대에 마우스를 올리면 순방문자수도 보여요 · 테두리 막대 = 11월(22일까지)"}
      </p>
    </div>
  );
}

/** 순위 막대 (정렬된 값, 한 가지 색) */
export function BarList({ items, unit, percent }: { items: Share[]; unit: string; percent?: boolean }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={it.label} className="group" title={`${it.label}: ${fmt(it.value)}${unit}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="mr-1.5 inline-block w-4 text-xs font-bold text-ink-soft">{i + 1}</span>
              {it.label}
            </span>
            <span className="shrink-0 font-bold tabular-nums">
              {fmt(it.value)}
              <span className="ml-0.5 text-xs font-normal text-ink-soft">{unit}</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-bg-soft">
            <div
              className="h-2 rounded-full transition-opacity group-hover:opacity-80"
              style={{ width: `${(it.value / (percent ? 100 : max)) * 100}%`, background: BLUE }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 요일 × 시간대 평균 조회수: 한 색의 진하기(옅음 → 진함) */
const RAMP = ["#eaf3fc", "#c9e1f6", "#9cc8ee", "#62a8e2", "#2786d2", "#004aad"];

export function Heatmap({ days, slots, values }: { days: string[]; slots: string[]; values: number[][] }) {
  const [hover, setHover] = useState<{ d: number; s: number } | null>(null);
  const flat = values.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const step = (v: number) => Math.min(RAMP.length - 1, Math.floor(((v - min) / (max - min || 1)) * RAMP.length));
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `2.2rem repeat(${slots.length}, minmax(0, 1fr))` }}>
        <span />
        {slots.map((s) => (
          <span key={s} className="truncate pb-1 text-center text-[11px] text-ink-soft">
            {s}
          </span>
        ))}
        {days.map((d, di) => (
          <div key={d} className="contents">
            <span className="self-center text-xs font-bold text-ink-soft">{d}</span>
            {values[di].map((v, si) => {
              const k = step(v);
              const on = hover?.d === di && hover?.s === si;
              return (
                <div
                  key={si}
                  onPointerEnter={() => setHover({ d: di, s: si })}
                  onPointerLeave={() => setHover(null)}
                  className={`grid h-9 place-items-center rounded-md text-[11px] tabular-nums ${on ? "ring-2 ring-ink" : ""}`}
                  style={{ background: RAMP[k], color: k >= 4 ? "#fff" : "#1f2430" }}
                  title={`${d}요일 ${slots[si]}: 평균 조회 ${v}회`}
                >
                  {v}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ink-soft">
        <span>{hover ? `${days[hover.d]}요일 ${slots[hover.s]} · 평균 조회 ${values[hover.d][hover.s]}회` : "칸에 마우스를 올리면 값이 보여요"}</span>
        <span className="flex items-center gap-1">
          적음
          {RAMP.map((c) => (
            <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />
          ))}
          많음
        </span>
      </div>
    </div>
  );
}
