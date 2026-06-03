"use client";

import { useState, useTransition } from "react";
import { createCRMAccount, createCRMContact } from "@/actions/crm";

type ProspectCompany = {
  name: string;
  website?: string;
  industry?: string;
  company_size?: string;
  country?: string;
  description?: string;
  contacts: Array<{
    name: string;
    role?: string;
    email?: string;
    linkedin_url?: string;
    phone?: string;
  }>;
};

function CompanyCard({ company, onAdded }: { company: ProspectCompany; onAdded: (id: string) => void }) {
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createCRMAccount({
        name: company.name,
        website: company.website,
        industry: company.industry,
        company_size: company.company_size,
        country: company.country,
        notes: company.description,
        stage: "Prospect",
      });
      if (result.error) { setError(result.error); return; }
      const accountId = result.id!;
      for (const c of company.contacts) {
        await createCRMContact({
          account_id: accountId,
          name: c.name,
          role: c.role,
          email: c.email,
          linkedin_url: c.linkedin_url,
          phone: c.phone,
          is_primary: c === company.contacts[0],
        });
      }
      setAdded(true);
      onAdded(accountId);
    });
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${added ? "border-green-200 opacity-75" : "border-gray-100 hover:shadow-md"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-[#32373c]">{company.name}</h3>
            {company.industry && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{company.industry}</span>}
            {company.country && <span className="text-xs text-gray-400">{company.country}</span>}
            {company.company_size && <span className="text-xs text-gray-400">{company.company_size}</span>}
          </div>
          {company.website && (
            <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-0.5 block">{company.website}</a>
          )}
          {company.description && <p className="text-xs text-gray-600 mt-2">{company.description}</p>}
        </div>
        <button
          onClick={handleAdd}
          disabled={isPending || added}
          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${added ? "bg-green-50 text-green-700" : "bg-[#667470] text-white hover:bg-[#556360]"} disabled:opacity-50`}
        >
          {added ? "✓ Adicionado" : isPending ? "A adicionar…" : "+ Pipeline"}
        </button>
      </div>

      {company.contacts.length > 0 && (
        <div className="mt-3 border-t border-gray-50 pt-3 space-y-2">
          {company.contacts.map((c, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#32373c]">{c.name} {c.role && <span className="text-gray-400 font-normal">· {c.role}</span>}</p>
                <div className="flex gap-3 flex-wrap">
                  {c.email && <span className="text-xs text-gray-500">{c.email}</span>}
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">LinkedIn</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

export function ProspectingClient() {
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("Portugal");
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ProspectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/crm/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, country, company_size: companySize, description }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao pesquisar"); return; }
      setResults(data.companies ?? []);
    } catch {
      setError("Erro de rede");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      {/* Search form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="font-bold text-[#32373c] mb-1">Pesquisar Empresas</h2>
        <p className="text-xs text-gray-400 mb-4">A IA pesquisa empresas que se encaixam no teu perfil de cliente ideal</p>
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Indústria</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder="ex: Hotel, Empresa Tech" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">País</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dimensão</label>
              <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#667470]/30">
                <option value="">Qualquer</option>
                <option>Solo</option>
                <option>2–10</option>
                <option>11–50</option>
                <option>51–200</option>
                <option>200+</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descrição do cliente ideal (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30 resize-none"
              placeholder="ex: Empresas de tecnologia com budget para team buildings..."
            />
          </div>
          <button type="submit" disabled={isLoading} className="w-full bg-[#667470] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#556360] transition-colors disabled:opacity-50">
            {isLoading ? "✨ A pesquisar com IA…" : "🔍 Pesquisar Empresas"}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm font-semibold text-white/80">{results.length} empresa{results.length !== 1 ? "s" : ""} encontrada{results.length !== 1 ? "s" : ""}</p>
            {addedIds.size > 0 && <p className="text-xs text-white/60">{addedIds.size} adicionada{addedIds.size !== 1 ? "s" : ""} ao pipeline</p>}
          </div>
          <div className="space-y-3">
            {results.map((company, i) => (
              <CompanyCard
                key={i}
                company={company}
                onAdded={(id) => setAddedIds((prev) => new Set([...prev, id]))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
