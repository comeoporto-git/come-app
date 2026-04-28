import { NextResponse } from "next/server";
import { createTransaction } from "@/lib/notion";
import { getStoredTransactions } from "@/lib/enablebanking";

const INVOICES = [
  { date: "2025-07-30", invoiceId: "FR13425/0409188", desc: "Disponibilização de um cartão de débito", taxFree: 19.00, total: 19.76 },
  { date: "2025-11-07", invoiceId: "FR13425/0624048", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-11-07", invoiceId: "FR13425/0624076", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-11-07", invoiceId: "FR13425/0624104", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-11-07", invoiceId: "FR13425/0624110", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-11-24", invoiceId: "FR13425/0661384", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-11-26", invoiceId: "FR13425/0665155", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-02", invoiceId: "FR13425/0683289", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-02", invoiceId: "FR13425/0685521", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-02", invoiceId: "FR13425/0685524", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-08", invoiceId: "FR13425/0703232", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-08", invoiceId: "FR13425/0703242", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-12", invoiceId: "FR13425/0715129", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-12", invoiceId: "FR13425/0715131", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-12", invoiceId: "FR13425/0715141", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724033", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724040", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724047", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724061", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724079", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724082", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724100", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-16", invoiceId: "FR13425/0724104", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-17", invoiceId: "FR13425/0726206", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-17", invoiceId: "FR13425/0726229", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-18", invoiceId: "FR13425/0726545", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-18", invoiceId: "FR13425/0726546", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-29", invoiceId: "FR13425/0746852", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-29", invoiceId: "FR13425/0746941", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-29", invoiceId: "FR13425/0746962", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-29", invoiceId: "FR13425/0747148", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-30", invoiceId: "FR13425/0748608", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-30", invoiceId: "FR13425/0748609", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2025-12-30", invoiceId: "FR13425/0748610", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-01-08", invoiceId: "FR13426/0023003", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-01-08", invoiceId: "FR13426/0023037", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-01-08", invoiceId: "FR13426/0023046", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-02-05", invoiceId: "FR13426/0100547", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-02-05", invoiceId: "FR13426/0100548", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-02-05", invoiceId: "FR13426/0100549", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-02-05", invoiceId: "FR13426/0100552", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-02-05", invoiceId: "FR13426/0100553", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-02-09", invoiceId: "FR13426/0109125", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-04", invoiceId: "FR13426/0160635", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-10", invoiceId: "FR13426/0179357", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-14", invoiceId: "FR13426/0187079", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-14", invoiceId: "FR13426/0187087", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-17", invoiceId: "FR13426/0192892", desc: "Disponibilização de um cartão de débito", taxFree: 19.00, total: 19.76 },
  { date: "2026-03-23", invoiceId: "FR13426/0203070", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-23", invoiceId: "FR13426/0203076", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-23", invoiceId: "FR13426/0203079", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-23", invoiceId: "FR13426/0203082", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-23", invoiceId: "FR13426/0203083", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-23", invoiceId: "FR13426/0203108", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-26", invoiceId: "FR13426/0208300", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-26", invoiceId: "FR13426/0208694", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-03-26", invoiceId: "FR13426/0208712", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230202", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230210", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230217", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230220", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230236", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230243", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230245", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230249", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230252", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230259", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230269", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-03", invoiceId: "FR13426/0230274", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-07", invoiceId: "FR13426/0241331", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-07", invoiceId: "FR13426/0241353", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-10", invoiceId: "FR13426/0250000", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-11", invoiceId: "FR13426/0266004", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-11", invoiceId: "FR13426/0266009", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-11", invoiceId: "FR13426/0266018", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-11", invoiceId: "FR13426/0266021", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-11", invoiceId: "FR13426/0266035", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-13", invoiceId: "FR13426/0269366", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-14", invoiceId: "FR13426/0272104", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-14", invoiceId: "FR13426/0272153", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-16", invoiceId: "FR13426/0277484", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-16", invoiceId: "FR13426/0277583", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
  { date: "2026-04-16", invoiceId: "FR13426/0277586", desc: "Com trf a crédito SEPA+", taxFree: 1.00, total: 1.04 },
];

export async function GET() {
  try {
    // Load existing bank movements to try to match each invoice
    const bankTxns = await getStoredTransactions(0, 10000);

    // Build a map: date → list of unmatched bank txns for that date with matching desc
    const bankByDate: Record<string, typeof bankTxns> = {};
    for (const t of bankTxns) {
      const d = new Date(t.transaction_date).toISOString().slice(0, 10);
      if (!bankByDate[d]) bankByDate[d] = [];
      bankByDate[d].push(t);
    }

    let created = 0;
    const errors: string[] = [];

    for (const inv of INVOICES) {
      try {
        // Try to find a matching bank movement (same date, same amount, debit)
        const candidates = (bankByDate[inv.date] || []).filter(
          (t) => t.credit_debit === "DBIT" && Math.abs(Math.abs(t.amount) - inv.total) < 0.02
        );
        const bankRef = candidates[0]?.transaction_id ?? undefined;

        await createTransaction({
          supplier: "Crédito Agrícola",
          fornecedorId: null,
          date: inv.date,
          invoiceId: inv.invoiceId,
          taxFree: inv.taxFree,
          iva6: 0,
          iva13: 0,
          iva23: 0,
          totalCost: inv.total,
          whoPaid: "COME",
          paymentMethod: "Cartão COME",
          status: "Paid",
          tourId: null,
          invoiceImageUrl: undefined,
          bankReference: bankRef,
          transferenciaFeita: false,
          precisaDeFatura: undefined,
        });
        created++;
      } catch (e) {
        errors.push(`${inv.invoiceId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return Response.json({ ok: true, created, errors });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
