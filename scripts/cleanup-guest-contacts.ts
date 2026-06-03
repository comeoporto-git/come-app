import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

// These are the IDs of contacts we just imported from sales.names (guest names, not B2B contacts)
// Remove all contacts added in the last 10 minutes that came from the sales table
async function main() {
  const result = await sql`
    DELETE FROM crm_contacts
    WHERE created_at > NOW() - INTERVAL '30 minutes'
    AND account_id IN (
      SELECT id FROM sales_pipeline WHERE stage = 'Client'
    )
  `;
  console.log(`Removed ${result.count} guest-name contacts`);
  await sql.end();
}
main().catch(console.error);
