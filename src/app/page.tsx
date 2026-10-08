import { redirect } from "next/navigation";
import { currentUser } from "@/lib/pageAuth";
import { ROLE_HOME } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  redirect(u ? ROLE_HOME[u.role] : "/login");
}
