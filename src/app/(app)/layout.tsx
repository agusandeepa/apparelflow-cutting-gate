import { redirect } from "next/navigation";
import { currentUser } from "@/lib/pageAuth";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Navbar user={{ role: user.role, fullName: user.fullName }} />
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </>
  );
}
