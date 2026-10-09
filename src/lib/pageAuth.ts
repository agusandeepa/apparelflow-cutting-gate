import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Role } from "@/db/schema";
import { COOKIE_NAME, sessionFromToken } from "@/server/auth";
import { ROLE_HOME } from "./demo";

export async function currentUser() {
  const db = await getDb();
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return sessionFromToken(db, token);
}

export async function requirePageRole(role: Role) {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role !== role) redirect(ROLE_HOME[u.role]);
  return u;
}
