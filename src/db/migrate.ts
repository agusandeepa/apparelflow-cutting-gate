import fs from "node:fs";
import path from "node:path";

/** Apply the (idempotent) schema using any client that can run a multi-statement SQL string. */
export async function applySchema(exec: (sql: string) => Promise<unknown>): Promise<void> {
  const file = path.join(process.cwd(), "src", "db", "schema.sql");
  await exec(fs.readFileSync(file, "utf8"));
}
