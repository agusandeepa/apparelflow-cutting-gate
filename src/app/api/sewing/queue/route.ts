import { handle } from "@/server/http";
import { sewingQueue } from "@/server/sewing";

export const dynamic = "force-dynamic";

// NOTE: the URL's query string is deliberately never read. The SQL filter is hard-coded to status = 'VERIFIED'.
export async function GET(req: Request) {
  return handle(req, (ctx) => sewingQueue(ctx));
}
