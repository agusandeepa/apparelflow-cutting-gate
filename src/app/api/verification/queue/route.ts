import { handle } from "@/server/http";
import { verifierQueue } from "@/server/verification";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, (ctx) => verifierQueue(ctx));
}
