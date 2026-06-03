import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
async function main() {
  const exists = await sql`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_activities_contact_id_fkey'
  `;
  if (exists.length === 0) {
    await sql`
      ALTER TABLE sales_activities
        ADD CONSTRAINT sales_activities_contact_id_fkey
        FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL
    `;
    console.log("FK added");
  } else {
    console.log("FK already exists");
  }
  await sql.end();
}
main().catch(console.error);
