import { redirect } from "next/navigation";
import { currentUser } from "@/lib/pageAuth";
import { ROLE_HOME } from "@/lib/demo";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const u = await currentUser();
  if (u) redirect(ROLE_HOME[u.role]);
  return <LoginClient />;
}
