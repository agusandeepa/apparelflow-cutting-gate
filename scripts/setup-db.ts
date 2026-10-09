
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { applySchema } from "../src/db/migrate";
import { seedDatabase } from "../src/db/seed";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL first (see .env.example)");
  const pool = new Pool({ connectionString: url });
  await applySchema((sql) => pool.query(sql));

  await seedDatabase(drizzle(pool, { schema }) as any);
  await pool.end();
  console.log("Database ready: schema applied + demo data seeded.");
}
main().catch((e) => { console.error(e); process.exit(1); });
