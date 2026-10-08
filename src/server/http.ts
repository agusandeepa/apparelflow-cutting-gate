import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import type { Ctx } from "./context";
import { HttpError } from "./errors";
import { COOKIE_NAME, SESSION_SECONDS, sessionFromToken, tokenFromCookieHeader } from "./auth";

/** Parse a JSON body. Non-JSON content types and malformed JSON are rejected (also a CSRF hardening). */
export async function readJson(req: Request): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) throw new HttpError(415, "Content-Type must be application/json");
  const text = await req.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Malformed JSON body"); }
}

export function parseId(raw: string): number {
  if (!/^\d{1,9}$/.test(raw)) throw new HttpError(400, "Invalid id");
  const n = Number(raw);
  if (n < 1) throw new HttpError(400, "Invalid id");
  return n;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: COOKIE_NAME, value: token, httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS,
  });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({ name: COOKIE_NAME, value: "", httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** DB trigger violations (backstop) are reported as 422 instead of a generic 500. */
function dbRuleViolation(e: unknown): string | null {
  const msgs = [(e as Error)?.message, (e as { cause?: Error })?.cause?.message].filter(Boolean) as string[];
  for (const m of msgs) {
    if (/HARD STOP|Illegal status transition|immutable|append-only/i.test(m)) return m;
  }
  return null;
}

type Handler = (ctx: Ctx, req: Request) => Promise<unknown | NextResponse>;

/** Builds the request context (DB + session derived from the httpOnly cookie) and maps errors to JSON. */
export async function handle(req: Request, fn: Handler, successStatus = 200): Promise<NextResponse> {
  try {
    const db = await getDb();
    const token = tokenFromCookieHeader(req.headers.get("cookie"));
    const session = await sessionFromToken(db, token);
    const out = await fn({ db, session }, req);
    if (out instanceof NextResponse) return out;
    return NextResponse.json(out, { status: successStatus, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message, details: e.details }, { status: e.status, headers: { "Cache-Control": "no-store" } });
    }
    const rule = dbRuleViolation(e);
    if (rule) return NextResponse.json({ error: rule }, { status: 422 });
    console.error("Unhandled API error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
