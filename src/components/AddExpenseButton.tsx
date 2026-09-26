"use client";

import { useState } from "react";
import { AddExpenseModal } from "./AddExpenseModal";
import type { Fornecedor } from "@/lib/notion";
import type { ServicePerson } from "./WhoPaidPicker";

export function AddExpenseButton({
  tourId,
  fornecedores,
  userRole,
  chefName,
  guideName,
  driverName,
  logisticsName,
  decoradorName,
  tourTeam = [],
  roster = [],
}: {
  tourId: string;
  fornecedores: Fornecedor[];
  userRole: string;
  chefName?: string;
  guideName?: string;
  driverName?: string;
  logisticsName?: string;
  decoradorName?: string;
  tourTeam?: { name: string; role: string }[];
  roster?: ServicePerson[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-[#32373c] text-white font-semibold px-3 py-1.5 rounded-full hover:bg-[#1a2018] active:scale-95 transition-all"
      >
        + Despesa
      </button>
      {open && (
        <AddExpenseModal
          tourId={tourId}
          fornecedores={fornecedores}
          userRole={userRole}
          chefName={chefName}
          guideName={guideName}
          driverName={driverName}
          logisticsName={logisticsName}
          decoradorName={decoradorName}
          tourTeam={tourTeam}
          roster={roster}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
