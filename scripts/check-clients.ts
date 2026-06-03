import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
async function main() {
  const rows = await sql`SELECT id, name, email, phone FROM clients ORDER BY name`;
  console.log(`${rows.length} clients:`);
  for (const r of rows) console.log(`  ${r.name} | ${r.email ?? "—"} | ${r.phone ?? "—"}`);
  await sql.end();
}
main().catch(console.error);
