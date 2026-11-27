"use client";

import { useMemo, useRef, useState } from "react";
import {
  COURSE_PRESETS,
  courseLineFromItem,
  eur,
  lineCost,
  lineUnits,
  nextCourseName,
  type QuoteLine,
  type SupplierItem,
} from "@/lib/eventQuotes";

type Line = QuoteLine & { key: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/**
 * The menu: courses in serving order, each with the material it needs per guest
 * (Snack 1 → prato de sobremesa + faca e garfo). Material lines carry their course,
 * so they count in the cost and in the supplier orders like any other line.
 */
export function MenuBuilder({
  courses,
  lines,
  items,
  guests,
  onCourses,
  onAddLines,
  onUpdateLine,
  onRemoveLine,
  onReplaceLines,
}: {
  courses: string[];
  lines: Line[];
  items: SupplierItem[];
  guests: number;
  onCourses: (courses: string[]) => void;
  onAddLines: (lines: QuoteLine[]) => void;
  onUpdateLine: (key: string, patch: Partial<QuoteLine>) => void;
  onRemoveLine: (key: string) => void;
  /** Replaces every line (used to rename/remove a course together with its lines). */
  onReplaceLines: (fn: (ls: Line[]) => Line[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const [preferred, setPreferred] = useState("");
  const [notice, setNotice] = useState("");

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.category !== "Transporte") m.set(i.fornecedorId, i.fornecedorName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const menuLines = lines.filter((l) => l.course);
  const menuCost = menuLines.reduce((s, l) => s + lineCost(l, guests), 0);

  // Total material across courses, merged by item.
  const totals = useMemo(() => {
    const m = new Map<string, { name: string; perPax: number; units: number }>();
    for (const l of lines) {
      if (!l.course) continue;
      const k = l.supplierItemId ?? norm(l.description);
      const e = m.get(k) ?? { name: l.description, perPax: 0, units: 0 };
      e.perPax += l.qtyMode === "per_pax" ? l.quantity : 0;
      e.units += lineUnits(l, guests);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.units - a.units);
  }, [lines, guests]);

  function addCourse(base: string) {
    const name = nextCourseName(base.trim(), courses);
    if (!name) return;
    onCourses([...courses, name]);
  }
  function renameCourse(oldName: string, newName: string) {
    const n = newName.trim();
    if (!n || n === oldName) return;
    if (courses.some((c) => c.toLowerCase() === n.toLowerCase() && c !== oldName)) {
      setNotice(`Já existe um prato chamado "${n}"`);
      return;
    }
    onCourses(courses.map((c) => (c === oldName ? n : c)));
    onReplaceLines((ls) => ls.map((l) => (l.course === oldName ? { ...l, course: n } : l)));
  }
  function removeCourse(name: string) {
    const count = lines.filter((l) => l.course === name).length;
    if (count && !confirm(`Remover "${name}" e o seu material (${count} linhas)?`)) return;
    onCourses(courses.filter((c) => c !== name));
    onReplaceLines((ls) => ls.filter((l) => l.course !== name));
  }
  function moveCourse(name: string, dir: -1 | 1) {
    const i = courses.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= courses.length) return;
    const copy = [...courses];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onCourses(copy);
  }
  function duplicateCourse(name: string) {
    const base = name.replace(/\s+\d+$/, "");
    const copyName = nextCourseName(base, courses);
    const i = courses.indexOf(name);
    onCourses([...courses.slice(0, i + 1), copyName, ...courses.slice(i + 1)]);
    onAddLines(lines.filter((l) => l.course === name).map(({ key: _k, ...l }) => { void _k; return { ...l, id: undefined, course: copyName }; }));
  }

  /** Moves every menu item that has an equivalent at the chosen supplier to that supplier. */
  function switchAllTo(fornecedorId: string) {
    let moved = 0;
    let missing = 0;
    const swaps = new Map<string, SupplierItem>();
    for (const l of lines) {
      if (!l.course || !l.supplierItemId) continue;
      const cur = itemsById.get(l.supplierItemId);
      if (!cur || cur.fornecedorId === fornecedorId) continue;
      const alt = cur.compareKey
        ? items
            .filter((i) => i.fornecedorId === fornecedorId && i.compareKey === cur.compareKey && i.unitPrice != null)
            .sort((x, y) => x.unitPrice! - y.unitPrice!)[0]
        : undefined;
      if (alt) { swaps.set(l.key, alt); moved += 1; } else missing += 1;
    }
    onReplaceLines((ls) =>
      ls.map((l) => {
        const alt = swaps.get(l.key);
        return alt ? { ...l, supplierItemId: alt.id, fornecedorId: alt.fornecedorId, description: alt.name, unitCost: alt.unitPrice ?? 0 } : l;
      }),
    );
    const who = suppliers.find(([id]) => id === fornecedorId)?.[1] ?? "";
    setNotice(`${moved} artigos passaram para ${who}${missing ? ` · ${missing} sem equivalente (ficaram como estavam)` : ""}`);
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-50 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Menu e material</h3>
          <p className="text-xs text-gray-400">Define os pratos e o material de cada um, por pessoa. Entra no custo e no pedido ao fornecedor.</p>
        </div>
        {menuLines.length > 0 && (
          <p className="text-xs text-gray-500 tabular-nums">
            {eur(menuCost)} <span className="text-gray-300">·</span> {eur(guests ? menuCost / guests : 0)}/pax
          </p>
        )}
      </header>

      {courses.length > 0 && suppliers.length > 1 && (
        <div className="px-4 pt-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-500">Fornecedor do material:</span>
          <div className="flex rounded-lg bg-gray-100 p-0.5 font-medium">
            <button type="button" onClick={() => setPreferred("")} className={`px-2.5 py-1 rounded-md ${!preferred ? "bg-white shadow-sm" : "text-gray-500"}`}>Melhor preço</button>
            {suppliers.map(([id, name]) => (
              <button key={id} type="button" onClick={() => setPreferred(id)} className={`px-2.5 py-1 rounded-md ${preferred === id ? "bg-white shadow-sm" : "text-gray-500"}`}>
                {name}
              </button>
            ))}
          </div>
          {preferred && menuLines.some((l) => l.fornecedorId && l.fornecedorId !== preferred) && (
            <button type="button" onClick={() => switchAllTo(preferred)} className="font-semibold text-[#4d5a56] hover:text-[#32373c]">
              Passar o menu todo para {suppliers.find(([id]) => id === preferred)?.[1]}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="mx-4 mt-3 text-xs bg-sky-50 text-sky-700 rounded-xl px-3 py-2 flex justify-between gap-2">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Fechar">✕</button>
        </p>
      )}

      <div className="p-4 grid gap-3 md:grid-cols-2">
        {courses.map((course, idx) => (
          <CourseCard
            key={course}
            course={course}
            index={idx}
            isLast={idx === courses.length - 1}
            lines={lines.filter((l) => l.course === course)}
            items={items}
            preferred={preferred}
            guests={guests}
            onRename={(n) => renameCourse(course, n)}
            onRemove={() => removeCourse(course)}
            onMove={(d) => moveCourse(course, d)}
            onDuplicate={() => duplicateCourse(course)}
            onAdd={(l) => onAddLines([l])}
            onUpdateLine={onUpdateLine}
            onRemoveLine={onRemoveLine}
          />
        ))}

        <div className={`rounded-2xl border-2 border-dashed border-gray-200 p-4 flex flex-col gap-3 ${courses.length === 0 ? "md:col-span-2" : ""}`}>
          <p className="text-xs font-medium text-gray-500">{courses.length ? "Adicionar prato" : "Começa pelo menu: que pratos vão ser servidos?"}</p>
          <div className="flex flex-wrap gap-1.5">
            {COURSE_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => addCourse(p)} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5">
                + {p}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) addCourse(custom);
              setCustom("");
            }}
            className="flex gap-2"
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Outro (ex.: Ostras)" className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#667470]" />
            <button type="submit" disabled={!custom.trim()} className="text-xs font-semibold bg-[#32373c] text-white rounded-xl px-3 disabled:opacity-40">Adicionar</button>
          </form>
        </div>
      </div>

      {totals.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Material total do menu para {guests} pessoas</p>
          <div className="flex flex-wrap gap-1.5">
            {totals.map((t) => (
              <span key={t.name} className="text-xs bg-[#667470]/10 text-[#32373c] rounded-full px-3 py-1 tabular-nums">
                {t.name} <span className="font-semibold">{t.units} un</span>
                {t.perPax > 0 && <span className="text-gray-500"> · {String(t.perPax).replace(".", ",")}/pax</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CourseCard({
  course,
  index,
  isLast,
  lines,
  items,
  preferred,
  guests,
  onRename,
  onRemove,
  onMove,
  onDuplicate,
  onAdd,
  onUpdateLine,
  onRemoveLine,
}: {
  course: string;
  index: number;
  isLast: boolean;
  lines: Line[];
  items: SupplierItem[];
  preferred: string;
  guests: number;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onAdd: (line: QuoteLine) => void;
  onUpdateLine: (key: string, patch: Partial<QuoteLine>) => void;
  onRemoveLine: (key: string) => void;
}) {
  const [name, setName] = useState(course);
  const cost = lines.reduce((s, l) => s + lineCost(l, guests), 0);
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 shrink-0 rounded-full bg-[#32373c] text-white text-[11px] font-semibold flex items-center justify-center">{index + 1}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? onRename(name) : setName(course))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#667470] focus:outline-none py-0.5"
          aria-label="Nome do prato"
        />
        <span className="text-xs text-gray-500 tabular-nums shrink-0">{eur(guests ? cost / guests : 0)}/pax</span>
        <div className="flex shrink-0 text-gray-300">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="px-1 hover:text-gray-600 disabled:opacity-30" aria-label="Subir">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast} className="px-1 hover:text-gray-600 disabled:opacity-30" aria-label="Descer">↓</button>
          <button type="button" onClick={onDuplicate} className="px-1 hover:text-gray-600 text-xs" title="Duplicar prato com o material" aria-label="Duplicar">⧉</button>
          <button type="button" onClick={onRemove} className="px-1 hover:text-rose-600" aria-label="Remover prato">✕</button>
        </div>
      </div>

      {lines.length > 0 && (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 bg-white rounded-xl px-2.5 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{l.description}</p>
                <p className="text-[10px] text-gray-400 tabular-nums">
                  {l.unitCost > 0 ? eur(l.unitCost) : <span className="text-amber-600">sem preço</span>} · {lineUnits(l, guests)} un
                </p>
              </div>
              <div className="flex items-center rounded-lg bg-gray-100 text-xs tabular-nums" title="Unidades por pessoa">
                <button type="button" onClick={() => onUpdateLine(l.key, { quantity: Math.max(0.5, l.quantity - 0.5), qtyMode: "per_pax" })} className="px-2 py-1 text-gray-500 hover:text-gray-800" aria-label="Menos">−</button>
                <span className="min-w-[2.2rem] text-center font-semibold">{String(l.quantity).replace(".", ",")}×</span>
                <button type="button" onClick={() => onUpdateLine(l.key, { quantity: l.quantity + 0.5, qtyMode: "per_pax" })} className="px-2 py-1 text-gray-500 hover:text-gray-800" aria-label="Mais">+</button>
              </div>
              <button type="button" onClick={() => onRemoveLine(l.key)} className="text-gray-300 hover:text-rose-600 text-sm px-1" aria-label="Remover">✕</button>
            </li>
          ))}
        </ul>
      )}

      <MaterialSearch items={items} preferred={preferred} onPick={(item) => onAdd(courseLineFromItem(item, course))} onFree={(text) => onAdd({
        category: "Material",
        description: text,
        supplierItemId: null,
        fornecedorId: null,
        qtyMode: "per_pax",
        quantity: 1,
        unitCost: 0,
        vatRate: 0.23,
        notes: null,
        course,
      })} />
    </div>
  );
}

/** Type-ahead over the supplier catalogue: "prato sob" → Pratos de sobremesa. */
function MaterialSearch({
  items,
  preferred,
  onPick,
  onFree,
}: {
  items: SupplierItem[];
  preferred: string;
  onPick: (item: SupplierItem) => void;
  onFree: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items
      .filter((i) => i.category !== "Transporte" && words.every((w) => norm(`${i.name} ${i.compareKey ?? ""} ${i.category}`).includes(w)))
      .sort((a, b) => {
        if (preferred) {
          const pa = a.fornecedorId === preferred ? 0 : 1;
          const pb = b.fornecedorId === preferred ? 0 : 1;
          if (pa !== pb) return pa - pb;
        }
        return (a.unitPrice ?? 1e9) - (b.unitPrice ?? 1e9);
      })
      .slice(0, 8);
  }, [q, items, preferred]);

  function pick(i: number) {
    if (i < results.length) onPick(results[i]);
    else if (q.trim()) onFree(q.trim());
    setQ("");
    setActive(0);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); pick(active); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="+ Material (ex.: prato sobremesa, garfo peixe)"
        className="w-full border border-dashed border-gray-300 bg-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-solid focus:border-[#667470]"
        aria-label="Adicionar material"
      />
      {open && q.trim() && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 max-h-72 overflow-y-auto">
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${active === i ? "bg-gray-50" : ""}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{r.name}</span>
                  <span className="block text-[10px] text-gray-400">{r.fornecedorName} · {r.category}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{r.unitPrice == null ? "—" : eur(r.unitPrice)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(results.length)}
              onMouseEnter={() => setActive(results.length)}
              className={`w-full text-left px-3 py-1.5 text-xs text-gray-500 ${active === results.length ? "bg-gray-50" : ""}`}
            >
              Adicionar &quot;{q.trim()}&quot; sem preço (fora do catálogo)
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
