// Time-intelligence helpers for the Financeiro tab — ported from the
// "COME - FIN" Power BI report's DAX measures (YTD / PY / YoY% / MTD / PM / MoM%).
//
// Callers pass already-classified, positive-amount entries (e.g. the
// AnalyticsDashboard's `earnings`/`expenses` arrays, which already exclude
// cancelled tours and archived transactions and already abs() the signed
// `totalCost` for expenses). This module only does date-bucketing and math,
// so both the existing monthly charts and this Trends section share one
// source of truth for what counts as income/expenses.

export type DatedAmount = { date: string; amount: number };

export type MonthlyAmount = {
  key: string;       // "YYYY-MM"
  label: string;     // "jan 2025"
  income: number;
  expenses: number;
  net: number;
};

export type GrowthPoint = {
  key: string;
  label: string;
  value: number | null;   // raw ratio, e.g. 0.42 = +42%; null when base is 0/missing (no prior period to compare)
  capped: number | null;  // value clamped to [capMin, capMax] for chart display
};

export type PeriodSummary = {
  ytd: number;
  py: number;
  yoy: number | null;
  mtd: number;
  pm: number;
  mom: number | null;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("pt-PT", { month: "short", year: "numeric" })
    .replace(".", "");
}
function prevMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}
function prevYearKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

/** DIVIDE — DAX-style: blank/null when the denominator is 0, never Infinity/NaN. */
function divide(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function clamp(v: number | null, min: number, max: number): number | null {
  if (v === null) return null;
  return Math.min(max, Math.max(min, v));
}

/** Sums income/expenses/net per calendar month across the full history present in the data. */
export function buildMonthlySeries(earnings: DatedAmount[], expenses: DatedAmount[]): MonthlyAmount[] {
  const incomeMap: Record<string, number> = {};
  const expenseMap: Record<string, number> = {};
  for (const e of earnings) {
    if (!e.date) continue;
    const k = monthKey(new Date(e.date));
    incomeMap[k] = (incomeMap[k] ?? 0) + e.amount;
  }
  for (const e of expenses) {
    if (!e.date) continue;
    const k = monthKey(new Date(e.date));
    expenseMap[k] = (expenseMap[k] ?? 0) + e.amount;
  }
  const keys = [...new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)])].sort();
  return keys.map((key) => {
    const income = incomeMap[key] ?? 0;
    const expensesVal = expenseMap[key] ?? 0;
    return { key, label: monthLabel(key), income, expenses: expensesVal, net: income - expensesVal };
  });
}

function seriesFor(monthly: MonthlyAmount[], metric: "income" | "expenses" | "net"): Record<string, number> {
  return Object.fromEntries(monthly.map((m) => [m.key, m[metric]]));
}

/** Per-month YoY % — this month vs. the same month last year, capped for chart display. */
export function buildYoYSeries(
  monthly: MonthlyAmount[],
  metric: "income" | "expenses" | "net",
  capMin = -1,
  capMax = 3,
): GrowthPoint[] {
  const byKey = seriesFor(monthly, metric);
  return monthly.map((m) => {
    const prior = byKey[prevYearKey(m.key)];
    const value = prior === undefined ? null : divide(byKey[m.key] - prior, prior);
    return { key: m.key, label: m.label, value, capped: clamp(value, capMin, capMax) };
  });
}

/** Per-month MoM % — this month vs. the previous month, capped for chart display. */
export function buildMoMSeries(
  monthly: MonthlyAmount[],
  metric: "income" | "expenses" | "net",
  capMin = -1,
  capMax = 2,
): GrowthPoint[] {
  const byKey = seriesFor(monthly, metric);
  return monthly.map((m) => {
    const prior = byKey[prevMonthKey(m.key)];
    const value = prior === undefined ? null : divide(byKey[m.key] - prior, prior);
    return { key: m.key, label: m.label, value, capped: clamp(value, capMin, capMax) };
  });
}

/** YTD / PY / YoY% / MTD / PM / MoM% for one metric's raw dated entries, as of `asOf` (default: today). */
export function summarizeMetric(entries: DatedAmount[], asOf: Date = new Date()): PeriodSummary {
  const yearStart = new Date(asOf.getFullYear(), 0, 1);
  const pyStart = new Date(asOf.getFullYear() - 1, 0, 1);
  const pyEnd = new Date(asOf.getFullYear() - 1, asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const pmStart = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);
  const pmEnd = new Date(asOf.getFullYear(), asOf.getMonth(), 0, 23, 59, 59, 999); // last day of prior month

  let ytd = 0, py = 0, mtd = 0, pm = 0;
  for (const e of entries) {
    if (!e.date) continue;
    const d = new Date(e.date);
    if (d >= yearStart && d <= asOf) ytd += e.amount;
    if (d >= pyStart && d <= pyEnd) py += e.amount;
    if (d >= monthStart && d <= asOf) mtd += e.amount;
    if (d >= pmStart && d <= pmEnd) pm += e.amount;
  }
  return { ytd, py, yoy: divide(ytd - py, py), mtd, pm, mom: divide(mtd - pm, pm) };
}

/** Income, Expenses, and Net Result summaries together — Net nets the other two at every level. */
export function summarizeAll(
  earnings: DatedAmount[],
  expenses: DatedAmount[],
  asOf: Date = new Date(),
): { income: PeriodSummary; expenses: PeriodSummary; net: PeriodSummary } {
  const income = summarizeMetric(earnings, asOf);
  const exp = summarizeMetric(expenses, asOf);
  const net: PeriodSummary = {
    ytd: income.ytd - exp.ytd,
    py: income.py - exp.py,
    yoy: divide((income.ytd - exp.ytd) - (income.py - exp.py), income.py - exp.py),
    mtd: income.mtd - exp.mtd,
    pm: income.pm - exp.pm,
    mom: divide((income.mtd - exp.mtd) - (income.pm - exp.pm), income.pm - exp.pm),
  };
  return { income, expenses: exp, net };
}
