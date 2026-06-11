import { supabase } from "@/lib/notion";
import { BusinessRulesClient } from "./BusinessRulesClient";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const { data, error } = await supabase
    .from("business_rules")
    .select("name, value, notes")
    .order("key");

  const rules = data ?? [];

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Configurações</h1>
        <p className="text-[13px] text-white/50 mt-1">
          Regras de negócio usadas pelo AI Chat e pela aplicação.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-[#32373c]">Regras de Negócio</h2>
          <span className="text-[11px] text-[#32373c]/40">{rules.length} regras</span>
        </div>
        <p className="text-[12px] text-[#32373c]/40 mb-5">
          Estas regras são lidas em tempo real pelo AI Chat para responder a questões de disponibilidade e operações.
        </p>

        {error && (
          <p className="text-[12px] text-red-500 mb-4">
            Erro ao carregar regras: {error.message}
          </p>
        )}

        <BusinessRulesClient initialRules={rules} />
      </div>
    </main>
  );
}
