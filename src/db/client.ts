import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<any, typeof schema>;
export { schema };

const g = globalThis as unknown as { __afDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: 5 });
    return drizzle(pool, { schema }) as unknown as DB;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { applySchema } = await import("./migrate");
  const { seedDatabase } = await import("./seed");
  const { mkdirSync } = await import("node:fs");
  mkdirSync("./.data", { recursive: true });
  const client = new PGlite("./.data/pglite");
  await client.waitReady;
  await applySchema((sql) => client.exec(sql));
  const db = drizzle(client, { schema }) as unknown as DB;
  await seedDatabase(db);
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__afDb) {

    g.__afDb = create().catch((e) => { g.__afDb = undefined; throw e; });
  }
  return g.__afDb;
}
