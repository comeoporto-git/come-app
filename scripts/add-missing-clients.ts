import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

const MISSING = [
  { name: "The Little Orange",    email: "daf@thelittleorange.pt" },
  { name: "The Largo",            email: null },
  { name: "The Local Affair",     email: null },
  { name: "Tours For You",        email: null },
  { name: "Travel & Experiences", email: "travelandexperiences@gmail.com" },
];

async function main() {
  for (const c of MISSING) {
    // Check if already exists
    const exists = await sql`SELECT id FROM sales_pipeline WHERE name ILIKE ${c.name} LIMIT 1`;
    if (exists.length) { console.log(`  already exists: ${c.name}`); continue; }

    // Get the client UUID so we preserve the link
    const client = await sql`SELECT id FROM clients WHERE name ILIKE ${c.name} LIMIT 1`;
    const id = client[0]?.id ?? crypto.randomUUID();

    await sql`
      INSERT INTO sales_pipeline (id, name, email, stage)
      VALUES (${id}, ${c.name}, ${c.email ?? null}, 'Client')
      ON CONFLICT (id) DO UPDATE SET stage = 'Client'
    `;

    if (c.email) {
      await sql`
        INSERT INTO crm_contacts (account_id, name, email, is_primary)
        VALUES (${id}, ${c.name}, ${c.email}, true)
        ON CONFLICT DO NOTHING
      `;
    }

    console.log(`  + Added: ${c.name}`);
  }
  await sql.end();
  console.log("Done");
}
main().catch(console.error);
