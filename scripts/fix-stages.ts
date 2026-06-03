import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

const MAP: Record<string, string> = {
  "Tentativa de Conacto":  "Prospect",
  "Tentativa de Contacto": "Prospect",
  "Email enviado":         "Lead",
  "Reunião Marcada":       "Qualified",
  "Proposta Enviada":      "Proposal",
  "Cliente":               "Client",
  "Perdido":               "Lost",
};

async function main() {
  const rows = await sql`SELECT id, name, stage FROM sales_pipeline`;
  for (const r of rows) {
    const mapped = MAP[r.stage];
    if (mapped) {
      await sql`UPDATE sales_pipeline SET stage = ${mapped} WHERE id = ${r.id}`;
      console.log(`  ${r.name}: '${r.stage}' → '${mapped}'`);
    } else {
      // Unknown stage — default to Prospect
      await sql`UPDATE sales_pipeline SET stage = 'Prospect' WHERE id = ${r.id}`;
      console.log(`  ${r.name}: '${r.stage}' → 'Prospect' (unknown, defaulted)`);
    }
  }
  await sql.end();
  console.log("Done");
}
main().catch(console.error);
