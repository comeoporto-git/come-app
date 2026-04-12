import { neon } from "@neondatabase/serverless";

// Connection is created per-request (serverless-safe)
export function getDb() {
  return neon(process.env.DATABASE_URL!);
}
