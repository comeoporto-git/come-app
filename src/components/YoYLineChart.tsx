"use client";

import { useEffect, useRef, useState } from "react";

export type YoYPoint = {
  /** Short x-axis label, e.g. "jan" */
  label: string;
  /** Value for the current period; null = not reached yet (line stops) */
  current: number | null;
  /** Value for the same period one year earlier */
  previous: number | null;
};

type Props = {
  points: YoYPoint[];
  /** CSS colour of the current-year line */
  color: string;
  currentLabel: string;
  previousLabel: string;
  formatValue: (v: number) => string;
  height?: number;
};

const PREV_COLOR = "#9ca3af"; // gray-400 — comparison series stays recessive
const GRID_COLOR = "#f3f4f6";
const AXIS_TEXT = "#9ca3af";

function niceStep(range: number, ticks: number) {
  const raw = range / Math.max(ticks, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString("pt-PT", { maximumFractionDigits: 0 });
}

/**
 * Line chart with money on the Y axis and months on the X axis, comparing the
 * current period (solid, coloured) with the same period a year earlier (dashed gray).
 */
export function YoYLineChart({ points, color, currentLabel, previousLabel, formatValue, height = 200 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.flatMap((p) => [p.current, p.previous]).filter((v): v is number => v != null);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const step = niceStep(rawMax - rawMin || 1, 4);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.max(Math.ceil(rawMax / step) * step, yMin + step);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);

  const padL = 44, padR = 12, padT = 12, padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  function path(key: "current" | "previous") {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  const lastCurrentIdx = points.reduce((acc, p, i) => (p.current != null ? i : acc), -1);
  const hp = hover != null ? points[hover] : null;
  const delta = hp && hp.current != null && hp.previous != null && hp.previous !== 0
    ? ((hp.current - hp.previous) / Math.abs(hp.previous)) * 100
    : null;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // Thin out x labels on narrow screens
  const labelEvery = width < 420 && n > 6 ? 2 : 1;

  return (
    <div>
      {/* Measure first, draw after — the SVG never dictates the container width */}
      <div ref={wrapRef} className="relative w-full min-w-0" style={{ height }}>
        {width > 0 && <svg width={width} height={height} className="absolute left-0 top-0 block overflow-visible" role="img"
          aria-label={`${currentLabel} vs ${previousLabel}`}>
          {/* Grid + Y axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)}
                stroke={t === 0 ? "#d1d5db" : GRID_COLOR} strokeWidth={1} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT}
                style={{ fontVariantNumeric: "tabular-nums" }}>
                {compact(t)}
              </text>
            </g>
          ))}
          {/* X labels */}
          {points.map((p, i) => (i % labelEvery === 0 || i === hover) && (
            <text key={p.label + i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10}
              fill={i === hover ? "#32373c" : AXIS_TEXT} className="capitalize">
              {p.label}
            </text>
          ))}

          {/* Crosshair */}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="#d1d5db" strokeWidth={1} />
          )}

          {/* Previous year — dashed gray */}
          <path d={path("previous")} fill="none" stroke={PREV_COLOR} strokeWidth={2}
            strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
          {/* Current year */}
          <path d={path("current")} fill="none" stroke={color} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* End marker on the current line */}
          {lastCurrentIdx >= 0 && hover == null && (
            <circle cx={x(lastCurrentIdx)} cy={y(points[lastCurrentIdx].current!)} r={4}
              fill={color} stroke="white" strokeWidth={2} />
          )}

          {/* Hover markers */}
          {hp && hp.previous != null && (
            <circle cx={x(hover!)} cy={y(hp.previous)} r={4} fill={PREV_COLOR} stroke="white" strokeWidth={2} />
          )}
          {hp && hp.current != null && (
            <circle cx={x(hover!)} cy={y(hp.current)} r={4} fill={color} stroke="white" strokeWidth={2} />
          )}

          {/* Hit area */}
          <rect x={padL} y={0} width={plotW} height={height} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>}

        {hp && width > 0 && (
          <div
            className="absolute top-0 z-20 pointer-events-none bg-[#32373c] text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow whitespace-nowrap space-y-0.5"
            style={{
              left: x(hover!),
              transform: x(hover!) > width / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <p className="font-semibold capitalize border-b border-white/20 pb-0.5 mb-0.5">{hp.label}</p>
            <p className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-0.5 rounded" style={{ background: color }} />
              {currentLabel}: <span className="font-semibold tabular-nums">{hp.current != null ? formatValue(hp.current) : "—"}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-0.5 rounded" style={{ background: PREV_COLOR }} />
              {previousLabel}: <span className="font-semibold tabular-nums">{hp.previous != null ? formatValue(hp.previous) : "—"}</span>
            </p>
            {delta != null && (
              <p className="text-white/70">
                {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs ano anterior
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6"><line x1="1" x2="17" y1="3" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
          {currentLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6"><line x1="1" x2="17" y1="3" y2="3" stroke={PREV_COLOR} strokeWidth="2" strokeDasharray="4 3" /></svg>
          {previousLabel}
        </span>
      </div>
    </div>
  );
}
