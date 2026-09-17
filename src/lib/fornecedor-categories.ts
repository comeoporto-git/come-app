// Fixed color per fornecedor category (never cycled/hash-based) so a given
// category always reads the same across the app. New categories fall back
// to a neutral gray badge until added here.
export const CATEGORIA_COLORS: Record<string, string> = {
  "Produto":       "bg-emerald-100 text-emerald-700",
  "Restaurante":   "bg-orange-100 text-orange-700",
  "Material":      "bg-amber-100 text-amber-700",
  "Carro":         "bg-sky-100 text-sky-700",
  "Website":       "bg-indigo-100 text-indigo-700",
  "Vinho":         "bg-rose-100 text-rose-700",
  "Impostos":      "bg-red-100 text-red-700",
  "Contabilidade": "bg-slate-100 text-slate-700",
  "Chef":          "bg-fuchsia-100 text-fuchsia-700",
  "Vestuario":     "bg-pink-100 text-pink-700",
  "Decor":         "bg-purple-100 text-purple-700",
  "Serviço":       "bg-cyan-100 text-cyan-700",
  "Gasolina":      "bg-yellow-100 text-yellow-700",
  "Carrental":     "bg-teal-100 text-teal-700",
  "IT":            "bg-blue-100 text-blue-700",
  "Seguro":        "bg-violet-100 text-violet-700",
  "Banco":         "bg-green-100 text-green-700",
  "Transfer":      "bg-stone-100 text-stone-700",
};

export const CATEGORIA_NAMES = Object.keys(CATEGORIA_COLORS).sort((a, b) => a.localeCompare(b));

const FALLBACK_COLOR = "bg-gray-100 text-gray-500";

export function categoriaBadgeClass(categoria: string | null | undefined): string {
  if (!categoria) return FALLBACK_COLOR;
  return CATEGORIA_COLORS[categoria] ?? FALLBACK_COLOR;
}
