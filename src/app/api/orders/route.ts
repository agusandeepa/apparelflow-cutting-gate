import { handle, readJson } from "@/server/http";
import { createOrder, listOrders } from "@/server/orders";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, (ctx) => listOrders(ctx));
}
export async function POST(req: Request) {
  return handle(req, async (ctx) => createOrder(ctx, await readJson(req)), 201);
}
