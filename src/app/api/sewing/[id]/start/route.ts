import { handle, parseId } from "@/server/http";
import { startSewing } from "@/server/sewing";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, async (ctx) => startSewing(ctx, parseId((await params).id)));
}
