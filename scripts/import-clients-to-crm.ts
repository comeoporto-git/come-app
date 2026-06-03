import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

const SKIP = new Set([
  "", "Teste", "Teste123", "Website", "notion2gcal", "E1315", "Anthropic, PBC",
]);

async function main() {
  const clients = await sql`SELECT id, name, email, phone FROM clients ORDER BY name`;

  for (const c of clients) {
    const name = (c.name ?? "").trim();
    if (!name || SKIP.has(name)) {
      console.log(`  SKIP  ${name || "(empty)"}`);
      continue;
    }

    // Check if a pipeline entry already exists with a similar name
    const existing = await sql`
      SELECT id FROM sales_pipeline
      WHERE lower(name) ILIKE ${"%" + name.toLowerCase().split(" ")[0] + "%"}
      LIMIT 1
    `;

    if (existing.length > 0) {
      // Update existing entry to Client stage
      await sql`UPDATE sales_pipeline SET stage = 'Client' WHERE id = ${existing[0].id}`;
      // Add contact if email/phone and not already present
      if (c.email || c.phone) {
        const existingContact = await sql`
          SELECT id FROM crm_contacts WHERE account_id = ${existing[0].id} LIMIT 1
        `;
        if (existingContact.length === 0) {
          await sql`INSERT INTO crm_contacts (account_id, name, email, phone, is_primary)
                    VALUES (${existing[0].id}, ${name}, ${c.email ?? null}, ${c.phone ?? null}, true)`;
        }
      }
      console.log(`  MERGE ${name} → existing pipeline entry → Client`);
      continue;
    }

    // Create new pipeline entry
    const [newAccount] = await sql`
      INSERT INTO sales_pipeline (id, name, email, phone_number, stage)
      VALUES (${c.id}, ${name}, ${c.email ?? null}, ${c.phone ?? null}, 'Client')
      ON CONFLICT (id) DO UPDATE SET stage = 'Client'
      RETURNING id
    `;

    // Add contact if email/phone exists
    if (c.email || c.phone) {
      const existingContact = await sql`SELECT id FROM crm_contacts WHERE account_id = ${newAccount.id} LIMIT 1`;
      if (existingContact.length === 0) {
        await sql`INSERT INTO crm_contacts (account_id, name, email, phone, is_primary)
                  VALUES (${newAccount.id}, ${name}, ${c.email ?? null}, ${c.phone ?? null}, true)`;
      }
    }

    console.log(`  ADD   ${name}`);
  }

  await sql.end();
  console.log("\nDone");
}
main().catch(console.error);
