import { handle, parseId } from "@/server/http";
import { submitOrder } from "@/server/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, async (ctx) => submitOrder(ctx, parseId((await params).id)));
}
