"use client";

import { useState } from "react";
import Link from "next/link";
import type { CRMAccount } from "@/lib/notion";
import { AddAccountModal } from "./AddAccountModal";
import { StageBadge, StageSelect } from "./StageSelect";

const STAGES = ["Prospect", "Lead", "Qualified", "Proposal", "Client"];

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function euros(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

const CATEGORY_COLORS: Record<string, string> = {
  DMC:       "bg-blue-100 text-blue-700",
  Events:    "bg-orange-100 text-orange-700",
  Hotel:     "bg-teal-100 text-teal-700",
  Corporate: "bg-indigo-100 text-indigo-700",
  Other:     "bg-gray-100 text-gray-500",
};

function AccountCard({ account }: { account: CRMAccount }) {
  const days = daysSince(account.last_contacted_at);
  const stale = days !== null && days > 14;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 hover:shadow-md transition-shadow group ${stale ? "border-orange-200" : "border-gray-100"}`}>
      <Link href={`/admin/crm/accounts/${account.id}`} className="block">
        <div className="flex items-start gap-1.5 flex-wrap">
          <p className="font-semibold text-sm text-[#32373c] truncate group-hover:text-[#667470] transition-colors">{account.name}</p>
          {account.category && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${CATEGORY_COLORS[account.category] ?? CATEGORY_COLORS.Other}`}>{account.category}</span>
          )}
        </div>
        {account.industry && <p className="text-xs text-gray-400 mt-0.5 truncate">{account.industry}</p>}
        {account.pessoa && <p className="text-xs text-gray-500 mt-1 truncate">{account.pessoa}</p>}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <StageSelect accountId={account.id} currentStage={account.stage} />
        <div className="flex items-center gap-1.5 shrink-0">
          {account.revenue != null && account.revenue > 0 && (
            <span className="text-xs font-medium text-emerald-600">{euros(account.revenue)}</span>
          )}
          {days !== null && (
            <span className={`text-xs ${stale ? "text-orange-500 font-medium" : "text-gray-400"}`}>
              {days === 0 ? "hoje" : `${days}d`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const COLUMN_LIMIT = 3;

function PipelineColumn({ stage, accounts }: { stage: string; accounts: CRMAccount[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? accounts : accounts.slice(0, COLUMN_LIMIT);
  const hidden = accounts.length - COLUMN_LIMIT;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <StageBadge stage={stage} />
        <span className="text-xs text-gray-400">{accounts.length}</span>
      </div>
      {accounts.length === 0 ? (
        <div className="border-2 border-dashed border-gray-100 rounded-xl h-20 flex items-center justify-center">
          <span className="text-xs text-gray-300">—</span>
        </div>
      ) : (
        <>
          {visible.map((a) => <AccountCard key={a.id} account={a} />)}
          {!expanded && hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1 w-full text-xs text-gray-400 hover:text-[#667470] py-1.5 border border-dashed border-gray-200 rounded-xl hover:border-[#667470]/40 transition-colors"
            >
              + {hidden} mais
            </button>
          )}
          {expanded && accounts.length > COLUMN_LIMIT && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-1 w-full text-xs text-gray-400 hover:text-[#667470] py-1 transition-colors"
            >
              ↑ Menos
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function PipelineBoard({ accounts }: { accounts: CRMAccount[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = [...new Set(accounts.map((a) => a.category).filter(Boolean))] as string[];

  const filtered = accounts
    .filter((a) => !activeStage || a.stage === activeStage)
    .filter((a) => !activeCategory || a.category === activeCategory);
  const byStage = STAGES.reduce<Record<string, CRMAccount[]>>((acc, s) => {
    acc[s] = filtered.filter((a) => a.stage === s);
    return acc;
  }, {});
  const lost = filtered.filter((a) => a.stage === "Lost");

  return (
    <>
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveStage(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeStage === null && !activeCategory ? "bg-[#667470] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
            >
              Todas ({accounts.length})
            </button>
            {STAGES.map((s) => {
              const count = accounts.filter((a) => a.stage === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setActiveStage(activeStage === s ? null : s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeStage === s ? "bg-[#667470] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
                >
                  {s} ({count})
                </button>
              );
            })}
          </div>
          {categories.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => {
                const count = accounts.filter((a) => a.category === cat).length;
                const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${activeCategory === cat ? colors + " border-transparent" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-[#667470] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#556360] transition-colors shrink-0"
        >
          + Empresa
        </button>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {STAGES.map((stage) => (
          <PipelineColumn key={stage} stage={stage} accounts={byStage[stage]} />
        ))}
      </div>

      {/* Lost accounts (collapsed) */}
      {lost.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 select-none">
            {lost.length} perdido{lost.length !== 1 ? "s" : ""}
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {lost.map((a) => <AccountCard key={a.id} account={a} />)}
          </div>
        </details>
      )}
    </>
  );
}
