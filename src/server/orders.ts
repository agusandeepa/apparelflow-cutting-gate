import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/db/client";
import { cuttingOrders, recipes, recipeComponents, verificationItems, users } from "@/db/schema";
import { expectedQty } from "@/domain/components";
import { assertTransition } from "@/domain/stateMachine";
import { requireRole, requireSession, type Ctx } from "./context";
import { HttpError } from "./errors";
import { createOrderSchema, parseBody } from "./validators";
import { loadItems, loadLatestRejections, toOrderView, type OrderView, type ItemView } from "./serializers";

const creator = alias(users, "creator");

export async function listRecipes(ctx: Ctx) {
  requireSession(ctx);
  const rows = await ctx.db.select().from(recipes).orderBy(recipes.recipeCode);
  const comps = await ctx.db.select().from(recipeComponents).orderBy(recipeComponents.id);
  return rows.map((r) => ({
    id: r.id, code: r.recipeCode, name: r.name, category: r.category,
    stdFabricYards: Number(r.stdFabricYards), wastageCap: Number(r.wastageCap),
    components: comps.filter((c) => c.recipeId === r.id)
      .map((c) => ({ id: c.id, name: c.componentName, piecesPerGarment: c.piecesPerGarment, imageUrl: c.imageUrl })),
  }));
}

async function fetchOrderViews(db: DB, onlyId?: number): Promise<(OrderView & { items: ItemView[] })[]> {
  const base = db
    .select({ order: cuttingOrders, recipe: recipes, creatorName: creator.fullName })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(creator, eq(creator.id, cuttingOrders.createdBy));
  const rows = await (onlyId ? base.where(eq(cuttingOrders.id, onlyId)) : base.orderBy(desc(cuttingOrders.createdAt), desc(cuttingOrders.id)));
  const ids = rows.map((r) => r.order.id);
  const [items, rejections] = await Promise.all([loadItems(db, ids), loadLatestRejections(db, ids)]);
  return rows.map((r) => ({
    ...toOrderView(r.order, r.recipe, r.creatorName, r.order.status === "REJECTED" ? rejections.get(r.order.id) ?? null : null),
    items: items.get(r.order.id) ?? [],
  }));
}

/** Cutting Supervisor workspace: every cutting order with progress. */
export async function listOrders(ctx: Ctx) {
  requireRole(ctx, "cutting_supervisor");
  return fetchOrderViews(ctx.db);
}

export async function getOrder(ctx: Ctx, id: number) {
  requireRole(ctx, "cutting_supervisor");
  const [o] = await fetchOrderViews(ctx.db, id);
  if (!o) throw new HttpError(404, "Order not found");
  return o;
}

export async function createOrder(ctx: Ctx, body: unknown) {
  const s = requireRole(ctx, "cutting_supervisor");
  const input = parseBody(createOrderSchema, body);

  const id = await ctx.db.transaction(async (tx) => {
    const [recipe] = await tx.select().from(recipes).where(eq(recipes.id, input.recipeId));
    if (!recipe) throw new HttpError(404, "Recipe not found");
    const comps = await tx.select().from(recipeComponents).where(eq(recipeComponents.recipeId, recipe.id));
    if (comps.length === 0) throw new HttpError(422, "Recipe has no components");

    const [order] = await tx.insert(cuttingOrders).values({
      recipeId: recipe.id, targetQty: input.targetQty, fabricRollId: input.fabricRollId,
      actualFabricYds: input.actualFabricYds.toFixed(2),
      createdBy: s.userId,           // from session, never from the body
    }).returning({ id: cuttingOrders.id });

    // Multiplier engine: expected component counts = pieces/garment x target qty
    await tx.insert(verificationItems).values(
      comps.map((c) => ({ orderId: order.id, componentId: c.id, expectedQty: expectedQty(c.piecesPerGarment, input.targetQty) })),
    );
    return order.id;
  });

  const [view] = await fetchOrderViews(ctx.db, id);
  return view;
}

/** IN_PROGRESS | REJECTED  ->  PENDING_VERIFICATION */
export async function submitOrder(ctx: Ctx, id: number) {
  requireRole(ctx, "cutting_supervisor");
  await ctx.db.transaction(async (tx) => {
    const [o] = await tx.select().from(cuttingOrders).where(eq(cuttingOrders.id, id)).for("update");
    if (!o) throw new HttpError(404, "Order not found");
    assertTransition(o.status, "PENDING_VERIFICATION");
    if (o.status === "REJECTED") {
      // re-cut batch: previous counts are void, verifier must count again
      await tx.update(verificationItems)
        .set({ actualQty: null, status: null, countedBy: null, countedAt: null })
        .where(eq(verificationItems.orderId, id));
    }
    await tx.update(cuttingOrders).set({ status: "PENDING_VERIFICATION" }).where(eq(cuttingOrders.id, id));
  });
  const [view] = await fetchOrderViews(ctx.db, id);
  return view;
}
