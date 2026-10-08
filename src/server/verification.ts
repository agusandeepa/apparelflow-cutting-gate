import { asc, eq, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/db/client";
import {
  cuttingOrders, recipes, recipeComponents, verificationItems, verificationLogs, users,
  type ComponentVariance, type LightStatus,
} from "@/db/schema";
import { trafficLight } from "@/domain/trafficLight";
import { assertTransition } from "@/domain/stateMachine";
import { expectedFabric, wastagePct } from "@/domain/wastage";
import { requireRole, type Ctx } from "./context";
import { HttpError } from "./errors";
import { approveSchema, parseBody, rejectSchema, saveCountsSchema } from "./validators";
import { loadItems, toOrderView, type ItemView } from "./serializers";

const creator = alias(users, "creator");

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

function summarize(items: ItemView[]) {
  const uncounted = items.filter((i) => i.actualQty === null);
  const red = items.filter((i) => i.actualQty !== null && i.actualQty < i.expectedQty);
  return {
    total: items.length,
    counted: items.length - uncounted.length,
    allCounted: uncounted.length === 0,
    redCount: red.length,
    hasRed: red.length > 0,
    canApprove: items.length > 0 && uncounted.length === 0 && red.length === 0,
  };
}

async function terminalView(db: DB | Tx, id: number) {
  const [row] = await db
    .select({ order: cuttingOrders, recipe: recipes, creatorName: creator.fullName })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(creator, eq(creator.id, cuttingOrders.createdBy))
    .where(eq(cuttingOrders.id, id));
  if (!row) throw new HttpError(404, "Order not found");
  const items = (await loadItems(db as DB, [id])).get(id) ?? [];
  const order = toOrderView(row.order, row.recipe, row.creatorName);
  return { order, items, summary: summarize(items) };
}

/** Lock the order row and make sure it is awaiting verification. */
async function lockPending(tx: Tx, id: number) {
  const [row] = await tx
    .select({ order: cuttingOrders, recipe: recipes })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .where(eq(cuttingOrders.id, id))
    .for("update", { of: cuttingOrders });
  if (!row) throw new HttpError(404, "Order not found");
  if (row.order.status !== "PENDING_VERIFICATION") {
    throw new HttpError(422, `Order is ${row.order.status}; only PENDING_VERIFICATION orders can be verified`);
  }
  return row;
}

async function loadRawItems(tx: Tx, orderId: number) {
  return tx
    .select({ item: verificationItems, name: recipeComponents.componentName })
    .from(verificationItems)
    .innerJoin(recipeComponents, eq(recipeComponents.id, verificationItems.componentId))
    .where(eq(verificationItems.orderId, orderId))
    .orderBy(asc(recipeComponents.id));
}

function toVariances(rows: Awaited<ReturnType<typeof loadRawItems>>): ComponentVariance[] {
  return rows.map(({ item, name }) => ({
    componentId: item.componentId, componentName: name, expected: item.expectedQty,
    actual: item.actualQty,
    variance: item.actualQty === null ? null : item.actualQty - item.expectedQty,
    // status is RE-COMPUTED here; the stored value is never trusted
    status: item.actualQty === null ? null : trafficLight(item.expectedQty, item.actualQty),
  }));
}

/** Verifier work list: orders waiting at the QC station. */
export async function verifierQueue(ctx: Ctx) {
  requireRole(ctx, "cutting_verifier");
  const rows = await ctx.db
    .select({ order: cuttingOrders, recipe: recipes, creatorName: creator.fullName })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(creator, eq(creator.id, cuttingOrders.createdBy))
    .where(eq(cuttingOrders.status, "PENDING_VERIFICATION"))
    .orderBy(asc(cuttingOrders.updatedAt));
  const items = await loadItems(ctx.db, rows.map((r) => r.order.id));
  return rows.map((r) => ({
    ...toOrderView(r.order, r.recipe, r.creatorName),
    summary: summarize(items.get(r.order.id) ?? []),
  }));
}

export async function getTerminal(ctx: Ctx, id: number) {
  requireRole(ctx, "cutting_verifier");
  const v = await terminalView(ctx.db, id);
  if (v.order.status !== "PENDING_VERIFICATION") {
    throw new HttpError(422, `Order is ${v.order.status}; it is not awaiting verification`);
  }
  return v;
}

/** Save physical counts. Traffic-light status is computed HERE from expected vs actual; clients cannot set it. */
export async function saveCounts(ctx: Ctx, id: number, body: unknown) {
  const s = requireRole(ctx, "cutting_verifier");
  const input = parseBody(saveCountsSchema, body);

  await ctx.db.transaction(async (tx) => {
    await lockPending(tx, id);
    const existing = await tx.select().from(verificationItems).where(eq(verificationItems.orderId, id));
    const byComponent = new Map(existing.map((i) => [i.componentId, i]));
    for (const c of input.counts) {
      const item = byComponent.get(c.componentId);
      if (!item) throw new HttpError(422, `Component ${c.componentId} does not belong to this order`);
      await tx.update(verificationItems).set({
        actualQty: c.actualQty,
        status: trafficLight(item.expectedQty, c.actualQty),
        countedBy: s.userId,
        countedAt: new Date(),
      }).where(and(eq(verificationItems.orderId, id), eq(verificationItems.componentId, c.componentId)));
    }
  });
  return terminalView(ctx.db, id);
}

/**
 * HARD STOP. Approval is only possible when EVERY component is counted and none is RED.
 * Everything is re-derived from the database inside one transaction; nothing from the client is trusted
 * (verifier id + timestamp come from the session / DB clock).
 */
export async function approve(ctx: Ctx, id: number, body: unknown) {
  const s = requireRole(ctx, "cutting_verifier");
  const input = parseBody(approveSchema, body);

  return ctx.db.transaction(async (tx) => {
    const { order, recipe } = await lockPending(tx, id);
    assertTransition(order.status, "VERIFIED");

    const raw = await loadRawItems(tx, id);
    const variances = toVariances(raw);

    if (variances.length === 0) throw new HttpError(422, "Order has no components to verify");
    const uncounted = variances.filter((v) => v.actual === null);
    if (uncounted.length > 0) {
      throw new HttpError(422, `Hard stop: ${uncounted.length} component(s) not counted yet`, {
        uncounted: uncounted.map((v) => v.componentName),
      });
    }
    const red = variances.filter((v) => v.status === "RED");
    if (red.length > 0) {
      throw new HttpError(422, `Hard stop: shortage in ${red.map((r) => r.componentName).join(", ")}. Approval is blocked; reject the batch for re-cutting.`, {
        shortages: red.map((r) => ({ component: r.componentName, expected: r.expected, actual: r.actual, variance: r.variance })),
      });
    }

    const wastage = wastagePct(Number(order.actualFabricYds), expectedFabric(order.targetQty, Number(recipe.stdFabricYards)));

    const [log] = await tx.insert(verificationLogs).values({
      orderId: id, verifierId: s.userId, decision: "APPROVED",
      approvalNote: input.note || null,
      wastagePct: wastage.toFixed(2), componentVariances: variances,
    }).returning();

    await tx.update(cuttingOrders).set({ status: "VERIFIED" }).where(eq(cuttingOrders.id, id));

    return {
      orderId: id, orderNo: order.orderNo, status: "VERIFIED" as const,
      verifiedBy: { id: s.userId, name: s.fullName },
      verifiedAt: log.timestamp.toISOString(),
      wastagePct: wastage, exceedsWastageCap: wastage > Number(recipe.wastageCap),
      variances,
    };
  });
}

/** Reject with a MANDATORY reason; batch returns to the supervisor for re-cutting. */
export async function reject(ctx: Ctx, id: number, body: unknown) {
  const s = requireRole(ctx, "cutting_verifier");
  const input = parseBody(rejectSchema, body);

  return ctx.db.transaction(async (tx) => {
    const { order, recipe } = await lockPending(tx, id);
    assertTransition(order.status, "REJECTED");
    const variances = toVariances(await loadRawItems(tx, id));
    const wastage = wastagePct(Number(order.actualFabricYds), expectedFabric(order.targetQty, Number(recipe.stdFabricYards)));

    const [log] = await tx.insert(verificationLogs).values({
      orderId: id, verifierId: s.userId, decision: "REJECTED",
      rejectionNote: input.reason,
      wastagePct: wastage.toFixed(2), componentVariances: variances,
    }).returning();

    await tx.update(cuttingOrders).set({ status: "REJECTED" }).where(eq(cuttingOrders.id, id));
    return { orderId: id, orderNo: order.orderNo, status: "REJECTED" as const, rejectedAt: log.timestamp.toISOString(), reason: input.reason };
  });
}

export type { LightStatus };
