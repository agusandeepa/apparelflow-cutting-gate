import { handle, parseId } from "@/server/http";
import { getOrder } from "@/server/orders";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, async (ctx) => getOrder(ctx, parseId((await params).id)));
}
