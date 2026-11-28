"use client";

import { useRef, useState, type ReactNode } from "react";

export type SwipeAction = { label: string; className: string; run: () => void };

const THRESHOLD = 90; // px to drag before the action fires
const MAX = 140;

/**
 * A list row you can drag sideways (finger or mouse) to act on it, like a mail
 * app: drag right for `right`, left for `left`. A short drag springs back; a
 * drag never counts as a click on the row.
 */
export function SwipeRow({ children, left, right }: { children: ReactNode; left?: SwipeAction; right?: SwipeAction }) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const horizontal = useRef(false);
  const dragged = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    horizontal.current = false;
    dragged.current = false;
    setAnimating(false);
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!horizontal.current) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      // Vertical movement is a scroll, not a swipe.
      if (Math.abs(my) > Math.abs(mx)) { start.current = null; return; }
      horizontal.current = true;
      dragged.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const allowed = Math.max(left ? -MAX : 0, Math.min(right ? MAX : 0, mx));
    setDx(allowed);
  }

  function finish() {
    const action = dx >= THRESHOLD ? right : dx <= -THRESHOLD ? left : undefined;
    start.current = null;
    setAnimating(true);
    if (action) {
      setDx(dx > 0 ? 600 : -600);
      setTimeout(action.run, 150);
      // If the row stays (e.g. the action failed), bring it back.
      setTimeout(() => { setAnimating(false); setDx(0); }, 700);
    } else {
      setDx(0);
    }
  }

  const shown = dx > 0 ? right : dx < 0 ? left : undefined;
  const armed = Math.abs(dx) >= THRESHOLD;

  return (
    <div className="relative overflow-hidden select-none">
      {shown && (
        <div className={`absolute inset-0 flex items-center px-5 text-[13px] font-semibold text-white ${shown.className} ${dx > 0 ? "justify-start" : "justify-end"} ${armed ? "" : "opacity-70"}`}>
          {shown.label}
        </div>
      )}
      <div
        className="relative bg-white touch-pan-y"
        onDragStart={(e) => e.preventDefault()}
        style={{ transform: `translateX(${dx}px)`, transition: animating ? "transform 150ms ease-out" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; }
        }}
      >
        {children}
      </div>
    </div>
  );
}
