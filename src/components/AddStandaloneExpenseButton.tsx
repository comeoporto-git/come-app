"use client";

import { useState } from "react";
import { AddExpenseModal } from "./AddExpenseModal";
import type { Fornecedor } from "@/lib/notion";

export function AddStandaloneExpenseButton({ fornecedores }: { fornecedores: Fornecedor[] }) {
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
          tourId={null}
          fornecedores={fornecedores}
          userRole="Admin"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
