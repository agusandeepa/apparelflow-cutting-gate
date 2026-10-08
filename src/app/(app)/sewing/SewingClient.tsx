"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, fmtDate } from "@/lib/api";
import { LightBadge, Spinner } from "@/components/ui";
import type { ItemView, OrderView } from "@/server/serializers";

type QueueRow = OrderView & {
  items: ItemView[];
  audit: { verifiedBy: string; verifiedAt: string; wastagePct: number; note: string | null };
  sewing: { started: boolean; startedAt: string | null; startedBy: string | null };
};

export default function SewingClient() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api<QueueRow[]>("/api/sewing/queue")); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function start(id: number) {
    setBusyId(id); setError(null);
    try { await api(`/api/sewing/${id}/start`, { method: "POST", body: {} }); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not start sewing"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">Sewing Queue</h1>
        <p className="text-[var(--ink-2)]">Only batches that passed the cutting gate appear here.</p>
      </div>
      {error && <p role="alert" className="banner-error">{error}</p>}
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <div className="card p-8 text-center text-[var(--ink-2)]">No verified batches yet.</div>
      ) : (
        <ul className="space-y-4">
          {rows.map((o) => (
            <li key={o.id} className="card p-4" data-testid="queue-item">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-num text-lg font-black">{o.orderNo}</p>
                  <p className="font-semibold">{o.recipe.name} · <span className="font-num">{o.targetQty}</span> garments · roll <span className="font-num">{o.fabricRollId}</span></p>
                </div>
                <span className="badge b-green">✔ Verified</span>
              </div>

              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-[var(--ink-2)]">Verified by</dt><dd className="font-bold">{o.audit.verifiedBy}</dd><dd className="text-xs">{fmtDate(o.audit.verifiedAt)}</dd></div>
                <div><dt className="text-[var(--ink-2)]">Fabric wastage</dt><dd className="font-num font-bold">{o.audit.wastagePct.toFixed(2)}% <span className="font-normal text-[var(--ink-2)]">(cap {o.recipe.wastageCap}%)</span></dd></div>
                <div><dt className="text-[var(--ink-2)]">Verifier audit note</dt><dd className="font-semibold">{o.audit.note || "—"}</dd></div>
              </dl>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold underline">Inspect piece counts</summary>
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead><tr>{["Component", "Expected", "Counted", "Variance", "Status"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.componentId}>
                        <td className="td font-semibold">{i.componentName}</td>
                        <td className="td font-num">{i.expectedQty}</td>
                        <td className="td font-num">{i.actualQty}</td>
                        <td className="td font-num">{i.variance !== null && i.variance > 0 ? `+${i.variance}` : i.variance}</td>
                        <td className="td"><LightBadge status={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>

              <div className="mt-4 flex justify-end">
                {o.sewing.started ? (
                  <p className="badge b-violet" role="status">Sewing in progress since {fmtDate(o.sewing.startedAt!)} · {o.sewing.startedBy}</p>
                ) : (
                  <button className="btn btn-primary" disabled={busyId === o.id} onClick={() => start(o.id)}>Start sewing assembly</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
