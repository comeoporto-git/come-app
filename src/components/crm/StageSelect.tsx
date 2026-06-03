"use client";

import { useTransition } from "react";
import { updateCRMAccount } from "@/actions/crm";

const STAGES = ["Prospect", "Lead", "Qualified", "Proposal", "Client", "Lost"];

const STAGE_COLORS: Record<string, string> = {
  Prospect:  "bg-gray-100 text-gray-600",
  Lead:      "bg-blue-100 text-blue-700",
  Qualified: "bg-yellow-100 text-yellow-700",
  Proposal:  "bg-purple-100 text-purple-700",
  Client:    "bg-green-100 text-green-700",
  Lost:      "bg-red-100 text-red-600",
};

export function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{stage}</span>;
}

export function StageSelect({ accountId, currentStage }: { accountId: string; currentStage: string }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const stage = e.target.value;
    startTransition(async () => {
      await updateCRMAccount(accountId, { stage });
    });
  }

  return (
    <select
      value={currentStage}
      onChange={handleChange}
      disabled={isPending}
      className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#667470]/30 disabled:opacity-50"
    >
      {STAGES.map((s) => <option key={s}>{s}</option>)}
    </select>
  );
}
