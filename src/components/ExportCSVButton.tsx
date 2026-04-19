"use client";

import type { Transaction } from "@/lib/notion";

export function ExportCSVButton({ transactions }: { transactions: Transaction[] }) {
  function download() {
    const inc = (iva: number, rate: number) =>
      iva ? (Math.round((iva / rate) * 100) / 100).toFixed(2) : "0.00";

    const headers = [
      "Data",
      "Fornecedor",
      "Nº Fatura",
      "Inc. 6%",
      "IVA 6%",
      "Inc. 13%",
      "IVA 13%",
      "Inc. 23%",
      "IVA 23%",
      "Base Total",
      "Total",
      "Método Pag.",
      "Status",
      "Verificado",
    ];

    const rows = transactions.map((t) =>
      [
        t.date ?? "",
        `"${t.supplier.replace(/"/g, '""')}"`,
        t.invoiceId,
        inc(t.iva6,  0.06),
        t.iva6.toFixed(2),
        inc(t.iva13, 0.13),
        t.iva13.toFixed(2),
        inc(t.iva23, 0.23),
        t.iva23.toFixed(2),
        t.taxFree.toFixed(2),
        t.totalCost.toFixed(2),
        t.paymentMethod,
        t.status,
        t.accountantVerified ? "Sim" : "Não",
      ].join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comeoporto_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      className="text-xs bg-[#32373c] text-white font-semibold px-3 py-1.5 rounded-full hover:bg-[#1a2018] transition-colors"
    >
      ⬇ CSV
    </button>
  );
}
