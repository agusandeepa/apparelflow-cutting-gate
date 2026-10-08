import { handle, parseId } from "@/server/http";
import { getTerminal } from "@/server/verification";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, async (ctx) => getTerminal(ctx, parseId((await params).id)));
}
