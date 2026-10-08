"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Field, LightBadge, Spinner } from "@/components/ui";
import { trafficLight } from "@/domain/trafficLight";
import type { LightStatus } from "@/db/schema";
import type { ItemView, OrderView } from "@/server/serializers";

type Terminal = { order: OrderView; items: ItemView[]; summary: { allCounted: boolean; hasRed: boolean; canApprove: boolean } };

const INT_RE = /^\d+$/;

export default function TerminalClient({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [t, setT] = useState<Terminal | null>(null);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<Terminal>(`/api/verification/${orderId}`);
      setT(data);
      setVals(Object.fromEntries(data.items.map((i) => [i.componentId, i.actualQty === null ? "" : String(i.actualQty)])));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  // Live traffic lights (display only: the server recomputes everything before approving)
  const rows = useMemo(() => (t?.items ?? []).map((i) => {
    const raw = (vals[i.componentId] ?? "").trim();
    let light: LightStatus | null = null; let err: string | undefined;
    if (raw !== "") {
      if (!INT_RE.test(raw)) err = "Whole numbers only (no letters, decimals or negatives)";
      else if (Number(raw) > 1_000_000) err = "Unrealistically large";
      else light = trafficLight(i.expectedQty, Number(raw));
    }
    return { item: i, raw, light, err };
  }), [t, vals]);

  const anyInvalid = rows.some((r) => r.err);
  const anyUncounted = rows.some((r) => r.raw === "");
  const anyRed = rows.some((r) => r.light === "RED");
  const canApprove = !!t && rows.length > 0 && !anyInvalid && !anyUncounted && !anyRed;

  const payload = () => ({ counts: rows.filter((r) => r.raw !== "" && !r.err).map((r) => ({ componentId: r.item.componentId, actualQty: Number(r.raw) })) });

  async function saveCounts() {
    setBusy(true); setError(null); setSaved(null);
    try {
      const data = await api<Terminal>(`/api/verification/${orderId}/count`, { body: payload() });
      setT(data); setSaved("Counts saved.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true); setError(null); setSaved(null);
    try {
      await api(`/api/verification/${orderId}/count`, { body: payload() });
      await api(`/api/verification/${orderId}/approve`, { body: note.trim() ? { note: note.trim() } : {} });
      router.replace("/verifier?approved=1"); router.refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Approval failed"); setBusy(false); }
  }

  async function reject() {
    const r = reason.trim();
    if (r.length < 5) { setReasonErr("A rejection reason is mandatory (at least 5 characters)."); return; }
    setBusy(true); setError(null);
    try {
      if (payload().counts.length) await api(`/api/verification/${orderId}/count`, { body: payload() });
      await api(`/api/verification/${orderId}/reject`, { body: { reason: r } });
      router.replace("/verifier"); router.refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Reject failed"); setBusy(false); }
  }

  if (error && !t) return <div className="space-y-4"><p role="alert" className="banner-error">{error}</p><Link href="/verifier" className="btn btn-ghost">← Back to QC station</Link></div>;
  if (!t) return <Spinner />;
  const o = t.order;

  return (
    <div className="space-y-5">
      <Link href="/verifier" className="text-sm font-bold underline">← QC station</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black"><span className="font-num">{o.orderNo}</span> · {o.recipe.name}</h1>
          <p className="text-[var(--ink-2)]">{o.targetQty} garments · roll <span className="font-num">{o.fabricRollId}</span> · cut by {o.createdBy}</p>
        </div>
        <div className="card px-4 py-2 text-sm">
          <p>Fabric used <span className="font-num font-bold">{o.actualFabricYds.toFixed(2)} yd</span> vs expected <span className="font-num font-bold">{o.expectedFabricYds.toFixed(2)} yd</span></p>
          <p>Wastage <span className="font-num font-bold">{o.wastagePct.toFixed(2)}%</span> (cap {o.recipe.wastageCap}%) {o.exceedsWastageCap && <span className="badge b-yellow ml-1">▲ Over cap</span>}</p>
        </div>
      </div>

      {error && <p role="alert" className="banner-error" data-testid="server-error">{error}</p>}
      {saved && <p role="status" className="banner-ok">{saved}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead><tr>{["Component", "Per garment", "Expected", "Counted (physical)", "Variance", "Status"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ item, raw, light, err }) => {
              const variance = raw !== "" && !err ? Number(raw) - item.expectedQty : null;
              return (
                <tr key={item.componentId} className={light === "RED" ? "bg-[#fff5f5]" : undefined}>
                  <td className="td font-semibold">{item.componentName}</td>
                  <td className="td font-num">{item.piecesPerGarment}</td>
                  <td className="td font-num text-lg font-black">{item.expectedQty}</td>
                  <td className="td" style={{ minWidth: "11rem" }}>
                    <Field label="" error={err}>
                      {(p) => <input {...p} aria-label={`Counted pieces: ${item.componentName}`} inputMode="numeric" autoComplete="off" placeholder="Enter count" value={vals[item.componentId] ?? ""}
                        onChange={(e) => { setVals((v) => ({ ...v, [item.componentId]: e.target.value })); setSaved(null); }} data-testid={`count-${item.componentName}`} />}
                    </Field>
                  </td>
                  <td className="td font-num font-bold">{variance === null ? "—" : variance > 0 ? `+${variance}` : variance}</td>
                  <td className="td"><LightBadge status={light} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anyRed && <p role="alert" className="banner-error">SHORTAGE DETECTED — Approve is blocked. The batch must be rejected with a reason and returned for re-cutting.</p>}
      {!anyRed && anyUncounted && <p className="banner-warn">Count every component to enable approval.</p>}

      <div className="card space-y-4 p-4">
        {!rejecting ? (
          <>
            <Field label="Audit note for the sewing floor (optional)">
              {(p) => <input {...p} placeholder="e.g. 5 extra cuffs kept as safety margin" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn btn-ghost" onClick={saveCounts} disabled={busy || anyInvalid || payload().counts.length === 0}>Save counts</button>
              <button className="btn btn-danger" onClick={() => setRejecting(true)} disabled={busy}>Reject batch…</button>
              <button className="btn btn-primary" onClick={approve} disabled={busy || !canApprove} data-testid="approve"
                title={canApprove ? "Approve and release to the sewing queue" : "Approval disabled: every component must be counted with no shortage"}>
                Approve batch
              </button>
            </div>
          </>
        ) : (
          <>
            <Field label="Rejection reason (mandatory)" error={reasonErr ?? undefined} hint="Explain the defect or shortage so the supervisor can re-cut.">
              {(p) => <textarea {...p} placeholder="e.g. Sleeve cuffs short by 12 pieces due to fabric defect on roll" value={reason} maxLength={500}
                onChange={(e) => { setReason(e.target.value); setReasonErr(null); }} data-testid="reject-reason" />}
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => { setRejecting(false); setReasonErr(null); }} disabled={busy}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={reject} disabled={busy} data-testid="confirm-reject">Confirm rejection</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
