import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import { applySchema } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import type { Ctx } from "@/server/context";
import * as orders from "@/server/orders";
import * as verification from "@/server/verification";

export type TestEnv = Awaited<ReturnType<typeof makeEnv>>;

/** Fresh in-memory Postgres (PGlite) with the real schema, triggers and seed data. */
export async function makeEnv() {
  const client = new PGlite();
  await client.waitReady;
  await applySchema((sql) => client.exec(sql));
  const db = drizzle(client, { schema }) as unknown as DB;
  await seedDatabase(db, 4);

  const ctxFor = async (email: string): Promise<Ctx> => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return { db, session: { userId: u.id, role: u.role, email: u.email, fullName: u.fullName } };
  };

  const supervisor = await ctxFor("supervisor@apparelflow.demo");
  const verifier = await ctxFor("verifier@apparelflow.demo");
  const sewing = await ctxFor("sewing@apparelflow.demo");
  const anonymous: Ctx = { db, session: null };

  const [blouse] = await db.select().from(schema.recipes).where(eq(schema.recipes.recipeCode, "REC-BL01"));
  const [crop] = await db.select().from(schema.recipes).where(eq(schema.recipes.recipeCode, "REC-CT02"));

  /** Supervisor creates an order and submits it to QC (PENDING_VERIFICATION). */
  async function pendingOrder(qty = 50, recipeId = blouse.id, yards = 90) {
    const o = await orders.createOrder(supervisor, { recipeId, targetQty: qty, fabricRollId: "FAB-ROLL-882", actualFabricYds: yards });
    await orders.submitOrder(supervisor, o.id);
    return o;
  }

  /** Count every component exactly as expected, except `overrides` (componentName -> actual). */
  async function countAll(orderId: number, overrides: Record<string, number> = {}) {
    const t = await verification.getTerminal(verifier, orderId);
    return verification.saveCounts(verifier, orderId, {
      counts: t.items.map((i) => ({ componentId: i.componentId, actualQty: overrides[i.componentName] ?? i.expectedQty })),
    });
  }

  return { db, client, supervisor, verifier, sewing, anonymous, blouse, crop, pendingOrder, countAll };
}
