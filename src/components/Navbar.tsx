"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Role } from "@/db/schema";
import { DEMO_USERS, ROLE_HOME, ROLE_LABEL } from "@/lib/demo";
import { api } from "@/lib/api";

export default function Navbar({ user }: { user: { role: Role; fullName: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchTo(role: string) {
    const d = DEMO_USERS.find((x) => x.role === role);
    if (!d || d.role === user.role) return;
    setBusy(true);
    try {
      await api("/api/auth/login", { body: { email: d.email, password: d.password } });
      router.replace(d.home); router.refresh();
    } finally { setBusy(false); }
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.replace("/login"); router.refresh();
  }

  return (
    <header className="border-b-2 border-[var(--ink)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href={ROLE_HOME[user.role]} className="text-lg font-black tracking-tight">ApparelFlow<span className="text-[var(--brand)]">·Cutting Gate</span></Link>
          <span className="badge b-violet" data-testid="role-badge">{ROLE_LABEL[user.role]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="persona" className="text-xs">Switch persona</label>
            <select id="persona" value={user.role} disabled={busy} onChange={(e) => switchTo(e.target.value)} style={{ width: "13rem", padding: "0.4rem 0.6rem" }}>
              {DEMO_USERS.map((d) => <option key={d.role} value={d.role}>{d.label}</option>)}
            </select>
          </div>
          <span className="hidden text-sm font-semibold sm:inline">{user.fullName}</span>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
