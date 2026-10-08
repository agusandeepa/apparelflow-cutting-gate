import { handle } from "@/server/http";
import { listRecipes } from "@/server/orders";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, (ctx) => listRecipes(ctx));
}
