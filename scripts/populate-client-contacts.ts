import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

async function main() {
  // Get all CRM accounts that map back to a client record (same UUID)
  const accounts = await sql`
    SELECT sp.id, sp.name, sp.email, sp.phone_number, sp.pessoa,
           c.email AS client_email, c.phone AS client_phone
    FROM sales_pipeline sp
    LEFT JOIN clients c ON c.id = sp.id
    WHERE sp.stage = 'Client'
    ORDER BY sp.name
  `;

  let total = 0;

  for (const account of accounts) {
    // Get all unique contact names + phones from actual sales for this client
    const salesContacts = await sql`
      SELECT DISTINCT names, phone_number
      FROM sales
      WHERE client_id = ${account.id}
        AND (names IS NOT NULL AND names != '')
      ORDER BY names
    `;

    // Existing contacts for this account
    const existing = await sql`
      SELECT lower(name) AS name FROM crm_contacts WHERE account_id = ${account.id}
    `;
    const existingNames = new Set(existing.map((r) => r.name));

    const toAdd: Array<{ name: string; phone?: string; email?: string; source: string }> = [];

    // 1. pessoa field on sales_pipeline
    if (account.pessoa && !existingNames.has(account.pessoa.toLowerCase())) {
      toAdd.push({ name: account.pessoa, email: account.email || account.client_email || undefined, phone: account.phone_number || undefined, source: "pessoa" });
    }

    // 2. names from actual sales bookings
    for (const s of salesContacts) {
      // names field can be comma-separated or a single name
      const names = (s.names as string).split(/[,\n]+/).map((n: string) => n.trim()).filter(Boolean);
      for (const name of names) {
        if (!existingNames.has(name.toLowerCase()) && !toAdd.find((t) => t.name.toLowerCase() === name.toLowerCase())) {
          toAdd.push({ name, phone: s.phone_number || undefined, source: "sales" });
        }
      }
    }

    if (toAdd.length === 0) {
      console.log(`  — ${account.name}: no new contacts`);
      continue;
    }

    for (let i = 0; i < toAdd.length; i++) {
      const c = toAdd[i];
      await sql`
        INSERT INTO crm_contacts (account_id, name, email, phone, is_primary)
        VALUES (${account.id}, ${c.name}, ${c.email ?? null}, ${c.phone ?? null}, ${i === 0 && existingNames.size === 0})
      `;
      total++;
      console.log(`  + ${account.name} → ${c.name} (${c.source})`);
    }
  }

  await sql.end();
  console.log(`\nDone — ${total} contacts added`);
}
main().catch(console.error);
