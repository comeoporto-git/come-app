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

function AccountCard({ account }: { account: CRMAccount }) {
  const days = daysSince(account.last_contacted_at);
  const stale = days !== null && days > 14;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 hover:shadow-md transition-shadow group ${stale ? "border-orange-200" : "border-gray-100"}`}>
      <Link href={`/admin/crm/accounts/${account.id}`} className="block">
        <p className="font-semibold text-sm text-[#32373c] truncate group-hover:text-[#667470] transition-colors">{account.name}</p>
        {account.industry && <p className="text-xs text-gray-400 mt-0.5 truncate">{account.industry}</p>}
        {account.pessoa && <p className="text-xs text-gray-500 mt-1 truncate">{account.pessoa}</p>}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <StageSelect accountId={account.id} currentStage={account.stage} />
        {days !== null && (
          <span className={`text-xs ${stale ? "text-orange-500 font-medium" : "text-gray-400"}`}>
            {days === 0 ? "hoje" : `${days}d`}
          </span>
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({ accounts }: { accounts: CRMAccount[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [activeStage, setActiveStage] = useState<string | null>(null);

  const filtered = activeStage ? accounts.filter((a) => a.stage === activeStage) : accounts;
  const byStage = STAGES.reduce<Record<string, CRMAccount[]>>((acc, s) => {
    acc[s] = filtered.filter((a) => a.stage === s);
    return acc;
  }, {});
  const lost = filtered.filter((a) => a.stage === "Lost");

  return (
    <>
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveStage(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeStage === null ? "bg-[#667470] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
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
          <div key={stage} className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <StageBadge stage={stage} />
              <span className="text-xs text-gray-400">{byStage[stage].length}</span>
            </div>
            {byStage[stage].length === 0 ? (
              <div className="border-2 border-dashed border-gray-100 rounded-xl h-20 flex items-center justify-center">
                <span className="text-xs text-gray-300">—</span>
              </div>
            ) : (
              byStage[stage].map((a) => <AccountCard key={a.id} account={a} />)
            )}
          </div>
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
