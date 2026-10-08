import { handle } from "@/server/http";
import { requireSession } from "@/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, async (ctx) => ({ user: requireSession(ctx) }));
}
