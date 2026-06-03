import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
async function main() {
  await sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS nif TEXT`;
  await sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS nome_fiscal TEXT`;
  await sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS morada_fiscal TEXT`;
  await sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS phone TEXT`;

  // Back-fill from clients table where IDs match
  const result = await sql`
    UPDATE sales_pipeline sp
    SET
      nif           = COALESCE(sp.nif,           NULLIF(c.nif, '')),
      nome_fiscal   = COALESCE(sp.nome_fiscal,   NULLIF(c.nome_fiscal, '')),
      morada_fiscal = COALESCE(sp.morada_fiscal, NULLIF(c.morada_fiscal, '')),
      phone         = COALESCE(sp.phone,         c.phone),
      email         = COALESCE(sp.email,         c.email)
    FROM clients c
    WHERE c.id = sp.id
  `;
  console.log(`Columns added and back-filled ${result.count} rows`);
  await sql.end();
}
main().catch(console.error);
