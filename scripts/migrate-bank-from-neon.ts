/**
 * Migrates bank_transactions, enablebanking_sessions, and sync_logs
 * from Neon (old DATABASE_URL) to Supabase.
 *
 * Run with:
 *   NEON_URL="postgresql://..." npx tsx scripts/migrate-bank-from-neon.ts
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const NEON_URL = process.env.NEON_URL;
const SUPABASE_URL = process.env.DATABASE_URL;

if (!NEON_URL) {
  console.error("Set NEON_URL=<old neon connection string> before running.");
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const neon = postgres(NEON_URL, { ssl: { rejectUnauthorized: false } });
const sb   = postgres(SUPABASE_URL, { ssl: { rejectUnauthorized: false } });

async function migrateSessions() {
  console.log("Migrating enablebanking_sessions...");
  try {
    const rows = await neon`SELECT * FROM enablebanking_sessions`;
    if (!rows.length) { console.log("  (empty)"); return; }
    for (const r of rows) {
      await sb`
        INSERT INTO enablebanking_sessions
          (session_id, institution_name, account_ids, valid_until, last_fetched_at, created_at)
        VALUES (${r.session_id}, ${r.institution_name}, ${r.account_ids}, ${r.valid_until}, ${r.last_fetched_at}, ${r.created_at})
        ON CONFLICT (session_id) DO NOTHING
      `;
    }
    console.log(`  ✓ ${rows.length} sessions`);
  } catch (e) { console.log("  (table not found in Neon — skipping)"); }
}

async function migrateBankTransactions() {
  console.log("Migrating bank_transactions...");
  try {
    const rows = await neon`SELECT * FROM bank_transactions ORDER BY id`;
    if (!rows.length) { console.log("  (empty)"); return; }
    let count = 0;
    for (const r of rows) {
      await sb`
        INSERT INTO bank_transactions
          (transaction_id, account_uid, institution_name, amount, currency,
           credit_debit, transaction_date, booking_date, merchant_name,
           remittance_info, raw, created_at)
        VALUES (
          ${r.transaction_id}, ${r.account_uid}, ${r.institution_name},
          ${r.amount}, ${r.currency}, ${r.credit_debit},
          ${r.transaction_date}, ${r.booking_date}, ${r.merchant_name},
          ${r.remittance_info}, ${r.raw}, ${r.created_at}
        )
        ON CONFLICT (transaction_id) DO NOTHING
      `;
      count++;
    }
    console.log(`  ✓ ${count} bank transactions`);
  } catch (e) { console.log("  (table not found in Neon — skipping)"); }
}

async function migrateSyncLogs() {
  console.log("Migrating sync_logs...");
  try {
    const rows = await neon`SELECT * FROM sync_logs ORDER BY id`;
    if (!rows.length) { console.log("  (empty)"); return; }
    for (const r of rows) {
      await sb`
        INSERT INTO sync_logs (ran_at, trigger, fetched, matched, unmatched, flagged, errors, fatal_error)
        VALUES (${r.ran_at}, ${r.trigger}, ${r.fetched}, ${r.matched}, ${r.unmatched}, ${r.flagged}, ${r.errors}, ${r.fatal_error})
      `;
    }
    console.log(`  ✓ ${rows.length} sync logs`);
  } catch (e) { console.log("  (table not found in Neon — skipping)"); }
}

async function main() {
  console.log("Migrating bank data from Neon → Supabase...\n");
  await migrateSessions();
  await migrateBankTransactions();
  await migrateSyncLogs();
  console.log("\nDone ✓");
  await neon.end();
  await sb.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
