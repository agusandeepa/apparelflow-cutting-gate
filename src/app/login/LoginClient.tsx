"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DEMO_USERS } from "@/lib/demo";
import { Field } from "@/components/ui";

export default function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: string, p: string) {
    setBusy(true); setError(null);
    try {
      const { user } = await api<{ user: { role: string } }>("/api/auth/login", { body: { email: e, password: p } });
      const home = DEMO_USERS.find((d) => d.role === user.role)?.home ?? "/";
      router.replace(home); router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 p-5 md:grid-cols-2">
      <section>
        <p className="font-num text-xs font-bold tracking-widest text-[var(--ink-2)]">APPARELFLOW ERP · CUTTING ROOM</p>
        <h1 className="mt-2 text-4xl font-black leading-tight">Gatekeeper<br />Verification Terminal</h1>
        <p className="mt-4 max-w-md text-[var(--ink-2)]">
          No unverified, mismatched or short bundle reaches the sewing floor. Every approval is checked, signed and
          time-stamped on the server.
        </p>

        <div className="card mt-6 p-4" aria-label="Demo credentials">
          <h2 className="text-sm font-extrabold tracking-wide">DEMO PERSONAS — click to sign in</h2>
          <ul className="mt-3 space-y-3">
            {DEMO_USERS.map((d) => (
              <li key={d.role} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line-soft)] p-3">
                <div>
                  <p className="font-bold">{d.label}</p>
                  <p className="font-num text-xs text-[var(--ink-2)]">{d.email} / {d.password}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}>Fill</button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => signIn(d.email, d.password)}>Sign in</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-extrabold">Sign in</h2>
        <form className="mt-4 space-y-4" onSubmit={(ev) => { ev.preventDefault(); signIn(email, password); }} noValidate>
          <Field label="Email">
            {(p) => <input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@apparelflow.demo" />}
          </Field>
          <Field label="Password">
            {(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />}
          </Field>
          {error && <p role="alert" className="banner-error">{error}</p>}
          <button className="btn btn-primary w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
