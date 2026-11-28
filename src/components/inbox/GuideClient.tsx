"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveGuideEntryAction, deleteGuideEntryAction } from "@/actions/inbox";
import type { GuideEntry } from "@/lib/companyGuide";

const slug = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const input = "w-full text-[13px] border border-black/15 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#111514]/15";

type Draft = { id?: string; section: string; title: string; content: string; active: boolean };

function Editor({ draft, sections, onCancel }: { draft: Draft; sections: string[]; onCancel: () => void }) {
  const router = useRouter();
  const [d, setD] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 border border-black/10 rounded-xl p-3 bg-gray-50/50">
      <div className="grid sm:grid-cols-[160px_1fr] gap-2">
        <select className={input} value={d.section} onChange={(e) => setD({ ...d, section: e.target.value })}>
          {sections.map((s) => <option key={s}>{s}</option>)}
        </select>
        <input className={input} placeholder="Título" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      <textarea className={input} rows={4} placeholder="A regra ou o procedimento…" value={d.content} onChange={(e) => setD({ ...d, content: e.target.value })} />
      {err && <p className="text-[12px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => start(async () => {
            const r = await saveGuideEntryAction(d);
            if (r.error) setErr(r.error);
            else { onCancel(); router.refresh(); }
          })}
          className="text-[13px] font-semibold text-white bg-[#111514] px-4 py-1.5 rounded-xl disabled:opacity-40"
        >
          Guardar
        </button>
        <button onClick={onCancel} className="text-[13px] text-gray-500 px-3">Cancelar</button>
      </div>
    </div>
  );
}

export function GuideClient({ entries, sections }: { entries: GuideEntry[]; sections: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bySection = sections
    .map((s) => ({ s, items: entries.filter((e) => e.section === s) }))
    .concat([{ s: "Outros", items: entries.filter((e) => !sections.includes(e.section)) }])
    .filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4">
        {editing === "new" ? (
          <Editor draft={{ section: "Respostas", title: "", content: "", active: true }} sections={sections} onCancel={() => setEditing(null)} />
        ) : (
          <button onClick={() => setEditing("new")} className="text-[13px] font-semibold text-[#32373c]/70 hover:text-[#32373c]">+ Nova regra no guia</button>
        )}
      </div>

      {bySection.map(({ s, items }) => (
        <section key={s} id={slug(s)} className="bg-white rounded-2xl p-4 scroll-mt-20">
          <h2 className="text-[14px] font-bold mb-2">{s}</h2>
          <ul className="divide-y divide-gray-100">
            {items.map((e) => (
              <li key={e.id} className="py-3">
                {editing === e.id ? (
                  <Editor draft={{ id: e.id, section: e.section, title: e.title, content: e.content, active: e.active }} sections={sections} onCancel={() => setEditing(null)} />
                ) : (
                  <div className={`flex gap-3 ${e.active ? "" : "opacity-50"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold">
                        {e.title}
                        {e.source === "learned" && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">aprendido</span>}
                        {!e.active && <span className="ml-2 text-[10px] text-gray-400">desativado</span>}
                      </p>
                      <p className="text-[13px] text-gray-600 whitespace-pre-line">{e.content}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 text-[12px]">
                      <button onClick={() => setEditing(e.id)} className="text-gray-400 hover:text-[#32373c]">Editar</button>
                      <button
                        disabled={pending}
                        onClick={() => start(async () => { await saveGuideEntryAction({ ...e, active: !e.active }); router.refresh(); })}
                        className="text-gray-400 hover:text-[#32373c]"
                      >
                        {e.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => { if (confirm(`Eliminar "${e.title}"?`)) start(async () => { await deleteGuideEntryAction(e.id); router.refresh(); }); }}
                        className="text-red-400 hover:text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
