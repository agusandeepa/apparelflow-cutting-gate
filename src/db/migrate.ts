import fs from "node:fs";
import path from "node:path";
export async function applySchema(exec: (sql: string) => Promise<unknown>): Promise<void> {
  const file = path.join(process.cwd(), "src", "db", "schema.sql");
  await exec(fs.readFileSync(file, "utf8"));
}
