"use client";

import { useRef, useState, type ReactNode } from "react";

export type SwipeAction = { label: string; className: string; run: () => void };

const BUTTON_W = 92; // px per action button

/**
 * A list row you drag to the left (finger or mouse) to reveal its action
 * buttons, like a mail app. Release past halfway and it stays open; tap a
 * button to act, tap the row or drag back to close. A drag never counts as a
 * click on the row.
 */
export function SwipeRow({ children, actions }: { children: ReactNode; actions: SwipeAction[] }) {
  const width = actions.length * BUTTON_W;
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; base: number } | null>(null);
  const horizontal = useRef(false);
  const dragged = useRef(false);
  const open = dx <= -width + 1;

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, base: dx };
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
    setDx(Math.max(-width - 24, Math.min(0, s.base + mx)));
  }

  function finish() {
    const wasDrag = horizontal.current;
    start.current = null;
    horizontal.current = false;
    if (!wasDrag) return;
    setAnimating(true);
    setDx(dx < -width / 2 ? -width : 0);
  }

  function close() {
    setAnimating(true);
    setDx(0);
  }

  return (
    <div className="relative overflow-hidden select-none">
      {dx < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => { close(); a.run(); }}
              className={`flex-1 text-[12px] font-semibold text-white px-2 ${a.className}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="relative bg-white touch-pan-y"
        onDragStart={(e) => e.preventDefault()}
        style={{ transform: `translateX(${dx}px)`, transition: animating ? "transform 160ms ease-out" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          // A drag, or a tap while the buttons are showing, doesn't open the row.
          if (dragged.current) {
            // The click that ends a drag: ignore it (and keep the buttons open).
            e.preventDefault();
            e.stopPropagation();
            dragged.current = false;
          } else if (open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
