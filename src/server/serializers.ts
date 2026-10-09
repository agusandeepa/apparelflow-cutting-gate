import { asc, desc, eq, inArray, and } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  cuttingOrders, recipes, recipeComponents, verificationItems, verificationLogs, users,
  type LightStatus, type OrderStatus,
} from "@/db/schema";
import { expectedFabric, wastagePct } from "@/domain/wastage";

export type ItemView = {
  componentId: number; componentName: string; piecesPerGarment: number;
  expectedQty: number; actualQty: number | null; status: LightStatus | null; variance: number | null;
};

export type OrderView = {
  id: number; orderNo: string; status: OrderStatus;
  recipe: { id: number; code: string; name: string; category: string; stdFabricYards: number; wastageCap: number };
  targetQty: number; fabricRollId: string; actualFabricYds: number; expectedFabricYds: number;
  wastagePct: number; exceedsWastageCap: boolean;
  createdBy: string; createdAt: string;
  latestRejection: { note: string; at: string; verifier: string } | null;
};

// Drizzle's inferred row shapes are verbose; this is the minimal structural shape we need.
type OrderRow = typeof cuttingOrders.$inferSelect;
type RecipeRow = typeof recipes.$inferSelect;

export function toOrderView(
  order: OrderRow, recipe: RecipeRow, creatorName: string,
  latestRejection: OrderView["latestRejection"] = null,
): OrderView {
  const std = Number(recipe.stdFabricYards);
  const cap = Number(recipe.wastageCap);
  const expFabric = expectedFabric(order.targetQty, std);
  const actual = Number(order.actualFabricYds);
  const w = wastagePct(actual, expFabric);
  return {
    id: order.id, orderNo: order.orderNo, status: order.status,
    recipe: { id: recipe.id, code: recipe.recipeCode, name: recipe.name, category: recipe.category, stdFabricYards: std, wastageCap: cap },
    targetQty: order.targetQty, fabricRollId: order.fabricRollId,
    actualFabricYds: actual, expectedFabricYds: expFabric,
    wastagePct: w, exceedsWastageCap: w > cap,
    createdBy: creatorName, createdAt: order.createdAt.toISOString(),
    latestRejection,
  };
}

export async function loadItems(db: DB, orderIds: number[]): Promise<Map<number, ItemView[]>> {
  const map = new Map<number, ItemView[]>();
  if (orderIds.length === 0) return map;
  const rows = await db
    .select({ item: verificationItems, comp: recipeComponents })
    .from(verificationItems)
    .innerJoin(recipeComponents, eq(recipeComponents.id, verificationItems.componentId))
    .where(inArray(verificationItems.orderId, orderIds))
    .orderBy(asc(recipeComponents.id));
  for (const { item, comp } of rows) {
    const list = map.get(item.orderId) ?? [];
    list.push({
      componentId: comp.id, componentName: comp.componentName, piecesPerGarment: comp.piecesPerGarment,
      expectedQty: item.expectedQty, actualQty: item.actualQty, status: item.status,
      variance: item.actualQty === null ? null : item.actualQty - item.expectedQty,
    });
    map.set(item.orderId, list);
  }
  return map;
}

export async function loadLatestRejections(db: DB, orderIds: number[]): Promise<Map<number, NonNullable<OrderView["latestRejection"]>>> {
  const map = new Map<number, NonNullable<OrderView["latestRejection"]>>();
  if (orderIds.length === 0) return map;
  const rows = await db
    .select({ log: verificationLogs, verifier: users.fullName })
    .from(verificationLogs)
    .innerJoin(users, eq(users.id, verificationLogs.verifierId))
    .where(and(inArray(verificationLogs.orderId, orderIds), eq(verificationLogs.decision, "REJECTED")))
    .orderBy(desc(verificationLogs.timestamp), desc(verificationLogs.id));
  for (const { log, verifier } of rows) {
    if (!map.has(log.orderId)) {
      map.set(log.orderId, { note: log.rejectionNote ?? "", at: log.timestamp.toISOString(), verifier });
    }
  }
  return map;
}
