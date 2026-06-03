import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

async function main() {
  const name = process.argv[2] ?? "Vinitur";

  const accounts = await sql`SELECT id, name FROM sales_pipeline WHERE name ILIKE ${"%" + name + "%"}`;
  if (!accounts.length) { console.log("Account not found"); await sql.end(); return; }

  for (const acc of accounts) {
    console.log(`\n=== ${acc.name} (${acc.id}) ===`);
    const sales = await sql`
      SELECT id, date, status, thread_ids
      FROM sales WHERE client_id = ${acc.id}
      ORDER BY date DESC LIMIT 10
    `;
    console.log(`Sales: ${sales.length}`);
    for (const s of sales) {
      console.log(`  ${s.date} | ${s.status} | thread_ids: ${JSON.stringify(s.thread_ids)}`);
    }
  }
  await sql.end();
}
main().catch(console.error);
