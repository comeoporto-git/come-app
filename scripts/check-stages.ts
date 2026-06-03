import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
async function main() {
  const rows = await sql`SELECT name, stage, sales_status FROM sales_pipeline ORDER BY created_at`;
  for (const r of rows) console.log(`${r.name}: stage='${r.stage}' sales_status='${r.sales_status}'`);
  await sql.end();
}
main().catch(console.error);
