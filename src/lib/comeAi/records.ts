import { supabase } from "@/lib/notion";
import { ENTITIES, entityDef, type EntityDef, type FieldDef } from "./entities";

/**
 * Generic read / change of any record COME AI may touch (see entities.ts).
 * Changes are built here as a before/after list and stored as a suggestion;
 * they are written only by applyRecordChange, when a person confirms.
 */

export type RecordChange = {
  field: string;
  label: string;
  old: unknown;
  new: unknown;
  /** Human-readable values (e.g. a person's name for a team id). */
  old_label?: string | null;
  new_label?: string | null;
};

export type RecordChangePayload = {
  entity: string;
  entity_label: string;
  op: "create" | "update" | "delete";
  record_id: string | null;
  record_label: string;
  changes: RecordChange[];
};

type Row = Record<string, unknown>;

function labelOf(def: EntityDef, row: Row | null | undefined): string {
  if (!row) return "";
  return def.display.map((c) => row[c]).filter((v) => v !== null && v !== undefined && v !== "").join(" · ");
}

function needDef(entity: string): EntityDef {
  const def = entityDef(entity);
  if (!def) throw new Error(`Entidade desconhecida: ${entity}. Usa uma de: ${Object.keys(ENTITIES).join(", ")}`);
  return def;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Readable label of a linked record (team member, service, client…). */
async function fkLabel(f: FieldDef, id: unknown): Promise<string | null> {
  if (!f.fk || typeof id !== "string" || !id) return null;
  const def = entityDef(f.fk);
  if (!def) return null;
  const { data } = await supabase.from(def.table).select(["id", ...def.display].join(", ")).eq("id", id).maybeSingle();
  return labelOf(def, data as unknown as Row) || null;
}

/** Accepts an id or a name for a linked record; a name must match exactly one record. */
async function resolveFk(f: FieldDef, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  const v = String(value).trim();
  if (UUID.test(v)) return v;
  const def = entityDef(f.fk!);
  if (!def) throw new Error(`${f.label}: ligação desconhecida`);
  const col = def.display[0];
  const { data } = await supabase.from(def.table).select(`id, ${col}`).ilike(col, `%${v}%`).limit(5);
  const rows = (data ?? []) as unknown as Row[];
  const exact = rows.filter((r) => String(r[col] ?? "").trim().toLowerCase() === v.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
  if (!pick) throw new Error(`${f.label}: "${v}" ${rows.length ? `corresponde a vários (${rows.map((r) => r[col]).join(", ")})` : "não encontrado"} — usa find_records para escolher o id.`);
  return String(pick.id);
}

async function coerce(f: FieldDef, value: unknown): Promise<unknown> {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "" && f.type !== "text" && f.type !== "textarea")) return null;
  switch (f.type) {
    case "number": {
      const num = Number(String(value).replace(",", "."));
      if (!Number.isFinite(num)) throw new Error(`${f.label}: "${value}" não é um número`);
      return num;
    }
    case "date": {
      const s = String(value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${f.label}: data no formato aaaa-mm-dd`);
      return s;
    }
    case "time": {
      const m = /^(\d{1,2})[:h](\d{2})/.exec(String(value));
      if (!m) throw new Error(`${f.label}: hora no formato HH:MM`);
      return `${m[1].padStart(2, "0")}:${m[2]}`;
    }
    case "bool":
      return value === true || /^(true|sim|yes|1)$/i.test(String(value));
    case "enum": {
      const s = String(value);
      const hit = f.options?.find((o) => o.toLowerCase() === s.toLowerCase());
      if (!hit) throw new Error(`${f.label}: "${s}" não é válido (${f.options?.join(", ")})`);
      return hit;
    }
    case "fk":
      return resolveFk(f, value);
    default:
      return String(value);
  }
}

function same(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return true;
  if (typeof a === "string" && /^\d{2}:\d{2}:\d{2}$/.test(a) && typeof b === "string") return a.slice(0, 5) === b.slice(0, 5);
  return String(a) === String(b);
}

/** Search records; returns id, label and the main fields. */
export async function findRecords(entity: string, query: string, filters: Record<string, unknown> = {}, limit = 10) {
  const def = needDef(entity);
  const cols = ["id", ...new Set([...def.display, ...def.fields.map((f) => f.key)])].join(", ");
  let q = supabase.from(def.table).select(cols);
  for (const [k, v] of Object.entries(filters)) {
    const f = def.fields.find((x) => x.key === k);
    if (!f) continue;
    q = q.eq(k, (await coerce(f, v)) as string);
  }
  const s = query.trim().replace(/[%,()]/g, " ");
  if (s && def.search.length) q = q.or(def.search.map((c) => `${c}.ilike.%${s}%`).join(","));
  if (def.order) q = q.order(def.order.column, { ascending: def.order.ascending, nullsFirst: false });
  const { data, error } = await q.limit(Math.min(limit, 30));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, label: labelOf(def, r), ...r }));
}

/** One record with all its editable fields (and readable labels for links). */
export async function getRecord(entity: string, id: string) {
  const def = needDef(entity);
  const cols = ["id", ...new Set([...def.display, ...def.fields.map((f) => f.key), ...(def.extra ?? [])])].join(", ");
  const { data, error } = await supabase.from(def.table).select(cols).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${def.label} ${id} não encontrado`);
  const row = data as unknown as Row;
  const links: Record<string, string | null> = {};
  for (const f of def.fields) if (f.type === "fk" && row[f.key]) links[f.key] = await fkLabel(f, row[f.key]);
  return { entity, label: labelOf(def, row), record: row, linked_names: links };
}

/** Builds the before/after list for a change (nothing is written). */
export async function buildRecordChange(entity: string, op: "create" | "update" | "delete", id: string | null, values: Record<string, unknown>): Promise<RecordChangePayload> {
  const def = needDef(entity);
  if (op === "create" && !def.canCreate) throw new Error(`Não é possível criar ${def.label} por aqui.`);
  if (op === "delete" && !def.canDelete) throw new Error(`Não é possível apagar ${def.label} por aqui${entity === "sales" ? " — muda o estado para Cancelled" : entity === "company_guide" ? " — põe Ativa = false" : ""}.`);
  if (op !== "create" && !id) throw new Error("Falta o id do registo (usa find_records).");

  let current: Row | null = null;
  if (id) {
    const { data } = await supabase.from(def.table).select(["id", ...new Set([...def.display, ...def.fields.map((f) => f.key)])].join(", ")).eq("id", id).maybeSingle();
    current = (data as unknown as Row) ?? null;
    if (!current) throw new Error(`${def.label} ${id} não encontrado`);
  }

  const changes: RecordChange[] = [];
  if (op !== "delete") {
    for (const [key, raw] of Object.entries(values)) {
      const f = def.fields.find((x) => x.key === key);
      if (!f) throw new Error(`${def.label}: o campo "${key}" não pode ser alterado. Campos: ${def.fields.map((x) => x.key).join(", ")}`);
      const nv = await coerce(f, raw);
      const ov = current ? current[key] ?? null : null;
      if (current && same(ov, nv)) continue;
      changes.push({
        field: key, label: f.label, old: ov, new: nv,
        old_label: f.type === "fk" ? await fkLabel(f, ov) : null,
        new_label: f.type === "fk" ? await fkLabel(f, nv) : null,
      });
    }
    if (!changes.length) throw new Error("Nada a mudar: os valores já são esses.");
  }
  return {
    entity, entity_label: def.label, op, record_id: id,
    record_label: current ? labelOf(def, current) : labelOf(def, Object.fromEntries(changes.map((c) => [c.field, c.new_label ?? c.new]))),
    changes,
  };
}

/** Writes a confirmed change. Only whitelisted fields; re-validated here. */
export async function applyRecordChange(p: RecordChangePayload): Promise<{ id: string }> {
  const def = needDef(p.entity);
  if (p.op === "delete") {
    if (!def.canDelete || !p.record_id) throw new Error("Não é possível apagar este registo.");
    const { error } = await supabase.from(def.table).delete().eq("id", p.record_id);
    if (error) throw new Error(error.message);
    return { id: p.record_id };
  }
  const values: Row = {};
  for (const c of p.changes) {
    const f = def.fields.find((x) => x.key === c.field);
    if (!f) throw new Error(`Campo não permitido: ${c.field}`);
    values[c.field] = await coerce(f, c.new);
  }
  if (p.op === "create") {
    if (!def.canCreate) throw new Error("Não é possível criar este registo.");
    // Expenses are stored negative, earnings positive.
    if (def.table === "transactions" && typeof values.valor === "number") {
      values.valor = values.type === "Earning" ? Math.abs(values.valor) : -Math.abs(values.valor);
      values.type ??= "Expense";
    }
    const { data, error } = await supabase.from(def.table).insert(values).select("id").single();
    if (error) throw new Error(error.message);
    return { id: data.id as string };
  }
  if (!p.record_id) throw new Error("Falta o registo.");
  const { error } = await supabase.from(def.table).update(values).eq("id", p.record_id);
  if (error) throw new Error(error.message);
  return { id: p.record_id };
}

/** The entities and their fields, for the AI's instructions. */
export function entitiesForPrompt(): string {
  return Object.entries(ENTITIES as Record<string, EntityDef>)
    .map(([k, d]) => `- ${k} (${d.label}${d.canCreate ? ", criar" : ""}${d.canDelete ? ", apagar" : ""}): ${d.fields.map((f) => `${f.key}${f.type === "fk" ? `→${f.fk}` : f.type === "enum" ? `[${f.options?.join("|")}]` : f.type !== "text" ? `(${f.type})` : ""}`).join(", ")}`)
    .join("\n");
}
