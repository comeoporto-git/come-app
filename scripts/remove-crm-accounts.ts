import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });

const TO_REMOVE = [
  "Lidl", "João Correia", "Dan McDevitt", "Bernas - Mescla",
  "Azwer Take", "Agencia Nova", "Rogério", "Cesar Castro",
];

async function main() {
  for (const name of TO_REMOVE) {
    const result = await sql`DELETE FROM sales_pipeline WHERE name = ${name}`;
    console.log(`  ✓ Removed: ${name} (${result.count} row)`);
  }
  await sql.end();
  console.log("Done");
}
main().catch(console.error);
