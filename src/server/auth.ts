import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { DB } from "@/db/client";
import { users } from "@/db/schema";
import type { Session } from "./context";
import { HttpError } from "./errors";
import { loginSchema, parseBody } from "./validators";

export const COOKIE_NAME = "af_session";
export const SESSION_SECONDS = 60 * 60 * 8;

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET (min 32 chars) is required in production");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-0123456789");
  }
  return new TextEncoder().encode(s);
}

// Pre-computed hash so a login for an unknown email costs the same as a wrong password (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId)).setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());
}

/** Verifies the JWT, then loads the user from the DB. The ROLE ALWAYS COMES FROM THE DATABASE, never from the token/client. */
export async function sessionFromToken(db: DB, token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) return null;
    return { userId: u.id, role: u.role, email: u.email, fullName: u.fullName };
  } catch {
    return null;
  }
}

export async function login(db: DB, body: unknown): Promise<{ token: string; user: Session }> {
  const { email, password } = parseBody(loginSchema, body);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, "Invalid email or password");
  return {
    token: await signToken(u.id),
    user: { userId: u.id, role: u.role, email: u.email, fullName: u.fullName },
  };
}

export function tokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}
