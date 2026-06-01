import postgres from "postgres";

// Singleton connection — postgres.js handles pooling internally
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!_sql) {
    _sql = postgres(process.env.DATABASE_URL!, {
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return _sql;
}
