import type { DB } from "@/db/client";
import type { Role } from "@/db/schema";
import { HttpError } from "./errors";

export type Session = { userId: number; role: Role; email: string; fullName: string };
export type Ctx = { db: DB; session: Session | null };

/** 401 when not logged in. */
export function requireSession(ctx: Ctx): Session {
  if (!ctx.session) throw new HttpError(401, "Authentication required");
  return ctx.session;
}

/** 401 when not logged in, 403 when the role is not allowed. Role comes from the DB-backed session. */
export function requireRole(ctx: Ctx, ...allowed: Role[]): Session {
  const s = requireSession(ctx);
  if (!allowed.includes(s.role)) {
    throw new HttpError(403, `Forbidden: role '${s.role}' may not perform this action`);
  }
  return s;
}
