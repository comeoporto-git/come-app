import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
async function main() {
  await sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS category TEXT`;
  console.log("category column added");
  await sql.end();
}
main().catch(console.error);
