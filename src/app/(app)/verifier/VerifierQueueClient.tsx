"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, fmtDate } from "@/lib/api";
import { Spinner } from "@/components/ui";
import type { OrderView } from "@/server/serializers";

type Row = OrderView & { summary: { total: number; counted: number; redCount: number } };

export default function VerifierQueueClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Row[]>("/api/verification/queue").then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">QC Verification Station</h1>
        <p className="text-[var(--ink-2)]">Count every physical component. Any shortage blocks approval.</p>
      </div>
      {error && <p role="alert" className="banner-error">{error}</p>}
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <div className="card p-8 text-center text-[var(--ink-2)]">No bundles are waiting at the QC station.</div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((o) => (
            <li key={o.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-num text-lg font-black">{o.orderNo}</p>
                  <p className="font-semibold">{o.recipe.name} <span className="font-num text-xs text-[var(--ink-2)]">{o.recipe.code}</span></p>
                </div>
                <span className="badge b-blue">Pending verification</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-[var(--ink-2)]">Batch quantity</dt><dd className="font-num font-bold">{o.targetQty} garments</dd></div>
                <div><dt className="text-[var(--ink-2)]">Fabric roll</dt><dd className="font-num font-bold">{o.fabricRollId}</dd></div>
                <div><dt className="text-[var(--ink-2)]">Cut by</dt><dd className="font-bold">{o.createdBy}</dd></div>
                <div><dt className="text-[var(--ink-2)]">Counted so far</dt><dd className="font-num font-bold">{o.summary.counted}/{o.summary.total}{o.summary.redCount ? ` · ${o.summary.redCount} short` : ""}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-[var(--ink-2)]">Created {fmtDate(o.createdAt)}</p>
              <Link href={`/verifier/${o.id}`} className="btn btn-primary mt-3 w-full">Open verification terminal</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
