import { handle, parseId, readJson } from "@/server/http";
import { reject } from "@/server/verification";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, async (ctx) => reject(ctx, parseId((await params).id), await readJson(req)));
}
