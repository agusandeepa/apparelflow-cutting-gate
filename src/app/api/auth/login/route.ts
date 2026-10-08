import { NextResponse } from "next/server";
import { handle, readJson, setSessionCookie } from "@/server/http";
import { login } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(req, async (ctx) => {
    const { token, user } = await login(ctx.db, await readJson(req));
    const res = NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(res, token);
    return res;
  });
}
