import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cuttingOrders, recipes, users, verificationLogs } from "@/db/schema";
import { requireRole, type Ctx } from "./context";
import { HttpError } from "./errors";
import { loadItems, toOrderView } from "./serializers";

const creator = alias(users, "creator");
const verifier = alias(users, "verifier");
const starter = alias(users, "starter");

export async function sewingQueue(ctx: Ctx) {
  requireRole(ctx, "sewing_supervisor");

  const rows = await ctx.db
    .select({
      order: cuttingOrders, recipe: recipes, creatorName: creator.fullName,
      log: verificationLogs, verifierName: verifier.fullName, starterName: starter.fullName,
    })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(creator, eq(creator.id, cuttingOrders.createdBy))
    .innerJoin(verificationLogs, and(eq(verificationLogs.orderId, cuttingOrders.id), eq(verificationLogs.decision, "APPROVED")))
    .innerJoin(verifier, eq(verifier.id, verificationLogs.verifierId))
    .leftJoin(starter, eq(starter.id, cuttingOrders.sewingStartedBy))
    .where(eq(cuttingOrders.status, "VERIFIED"))
    .orderBy(asc(verificationLogs.timestamp));

  const items = await loadItems(ctx.db, rows.map((r) => r.order.id));
  return rows.map((r) => ({
    ...toOrderView(r.order, r.recipe, r.creatorName),
    items: items.get(r.order.id) ?? [],
    audit: {
      verifiedBy: r.verifierName,
      verifierId: r.log.verifierId,
      verifiedAt: r.log.timestamp.toISOString(),
      wastagePct: Number(r.log.wastagePct),
      note: r.log.approvalNote,
      componentVariances: r.log.componentVariances,
    },
    sewing: {
      started: r.order.sewingStartedAt !== null,
      startedAt: r.order.sewingStartedAt?.toISOString() ?? null,
      startedBy: r.starterName ?? null,
    },
  }));
}

export async function startSewing(ctx: Ctx, id: number) {
  const s = requireRole(ctx, "sewing_supervisor");
  const [row] = await ctx.db.update(cuttingOrders)
    .set({ sewingStartedAt: new Date(), sewingStartedBy: s.userId })
    .where(and(eq(cuttingOrders.id, id), eq(cuttingOrders.status, "VERIFIED"), isNull(cuttingOrders.sewingStartedAt)))
    .returning({ id: cuttingOrders.id, startedAt: cuttingOrders.sewingStartedAt });
  if (!row) {

    const [o] = await ctx.db.select({ status: cuttingOrders.status, started: cuttingOrders.sewingStartedAt })
      .from(cuttingOrders).where(and(eq(cuttingOrders.id, id), eq(cuttingOrders.status, "VERIFIED")));
    if (o?.started) throw new HttpError(422, "Sewing has already been started for this batch");
    throw new HttpError(404, "Order is not in the sewing queue");
  }
  return { orderId: row.id, sewingStartedAt: row.startedAt!.toISOString(), startedBy: s.fullName };
}
