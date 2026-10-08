"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, fmtDate } from "@/lib/api";
import { Field, Modal, Spinner, StatusBadge } from "@/components/ui";
import type { OrderView, ItemView } from "@/server/serializers";

type Recipe = { id: number; code: string; name: string; category: string; stdFabricYards: number; wastageCap: number; components: { id: number; name: string; piecesPerGarment: number }[] };
type Order = OrderView & { items: ItemView[] };

export default function SupervisorClient() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api<Order[]>("/api/orders"), api<Recipe[]>("/api/recipes")]);
      setOrders(o); setRecipes(r);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(o: Order) {
    setBusyId(o.id); setError(null); setNotice(null);
    try {
      await api(`/api/orders/${o.id}/submit`, { method: "POST", body: {} });
      setNotice(`${o.orderNo} sent to the QC station.`);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Submit failed"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Cutting Orders</h1>
          <p className="text-[var(--ink-2)]">Create batches from recipes, log fabric, and send bundles to the QC station.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setOpen(true); setNotice(null); }} data-testid="new-order">+ New cutting order</button>
      </div>

      {error && <p role="alert" className="banner-error">{error}</p>}
      {notice && <p role="status" className="banner-ok">{notice}</p>}

      {!orders ? <Spinner /> : orders.length === 0 ? (
        <div className="card p-8 text-center text-[var(--ink-2)]">No cutting orders yet. Create the first one.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead><tr>
              {["Order", "Recipe", "Qty", "Fabric roll", "Fabric used / expected", "Status", ""].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="td"><p className="font-num font-bold">{o.orderNo}</p><p className="text-xs text-[var(--ink-2)]">{fmtDate(o.createdAt)}</p></td>
                  <td className="td"><p className="font-semibold">{o.recipe.name}</p><p className="font-num text-xs text-[var(--ink-2)]">{o.recipe.code}</p></td>
                  <td className="td font-num font-bold">{o.targetQty}</td>
                  <td className="td font-num">{o.fabricRollId}</td>
                  <td className="td font-num">{o.actualFabricYds.toFixed(2)} / {o.expectedFabricYds.toFixed(2)} yd</td>
                  <td className="td">
                    <StatusBadge status={o.status} />
                    {o.status === "REJECTED" && o.latestRejection && (
                      <div className="banner-error mt-2 max-w-xs text-sm" role="note">
                        <p className="font-extrabold">Returned for re-cutting</p>
                        <p>{o.latestRejection.note}</p>
                        <p className="text-xs font-normal">by {o.latestRejection.verifier} · {fmtDate(o.latestRejection.at)}</p>
                      </div>
                    )}
                  </td>
                  <td className="td text-right">
                    {(o.status === "IN_PROGRESS" || o.status === "REJECTED") && (
                      <button className="btn btn-primary" disabled={busyId === o.id} onClick={() => submit(o)}>
                        {o.status === "REJECTED" ? "Re-submit to QC" : "Submit to QC"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <CreateOrderModal recipes={recipes} onClose={() => setOpen(false)} onCreated={async (no) => { setOpen(false); setNotice(`${no} created. Submit it to QC when cutting is complete.`); await load(); }} />}
    </div>
  );
}

const INT_RE = /^\d+$/;
const YARD_RE = /^\d+(\.\d{1,2})?$/;
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;

function CreateOrderModal({ recipes, onClose, onCreated }: { recipes: Recipe[]; onClose: () => void; onCreated: (orderNo: string) => void }) {
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState("");
  const [roll, setRoll] = useState("");
  const [yards, setYards] = useState("");
  const [serverErr, setServerErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const errs = useMemo(() => {
    const e: Record<string, string> = {};
    if (!recipeId) e.recipeId = "Select a recipe";
    if (!qty.trim()) e.targetQty = "Target quantity is required";
    else if (!INT_RE.test(qty.trim()) || Number(qty) < 1) e.targetQty = "Enter a whole number greater than 0 (no letters, decimals or negatives)";
    else if (Number(qty) > 100000) e.targetQty = "Maximum 100,000 per batch";
    if (!roll.trim()) e.fabricRollId = "Fabric roll ID is required";
    else if (!ROLL_RE.test(roll.trim())) e.fabricRollId = "3-40 characters: letters, digits and hyphens (e.g. FAB-ROLL-882)";
    if (!yards.trim()) e.actualFabricYds = "Fabric used is required";
    else if (!YARD_RE.test(yards.trim()) || Number(yards) <= 0) e.actualFabricYds = "Enter a positive number, max 2 decimals (e.g. 92.5)";
    return e;
  }, [recipeId, qty, roll, yards]);

  const recipe = recipes.find((r) => String(r.id) === recipeId);
  const qtyN = !errs.targetQty && qty ? Number(qty) : null;
  const show = (k: string) => (touched[k] ? errs[k] : undefined) ?? serverErr[k];
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  async function save() {
    setTouched({ recipeId: true, targetQty: true, fabricRollId: true, actualFabricYds: true });
    if (Object.keys(errs).length) return;
    setBusy(true); setFormErr(null); setServerErr({});
    try {
      const o = await api<{ orderNo: string }>("/api/orders", {
        body: { recipeId: Number(recipeId), targetQty: Number(qty), fabricRollId: roll.trim(), actualFabricYds: Number(yards) },
      });
      onCreated(o.orderNo);
    } catch (e) {
      if (e instanceof ApiError) { setServerErr(e.fields); setFormErr(e.message); } else setFormErr("Could not create order");
      setBusy(false);
    }
  }

  return (
    <Modal title="New cutting order" onClose={onClose}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Recipe" error={show("recipeId")}>
          {(p) => (
            <select {...p} value={recipeId} onChange={(e) => setRecipeId(e.target.value)} onBlur={() => touch("recipeId")}>
              <option value="">Select a recipe…</option>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name} ({r.stdFabricYards} yd/pc, cap {r.wastageCap}%)</option>)}
            </select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target batch quantity (garments)" error={show("targetQty")}>
            {(p) => <input {...p} inputMode="numeric" autoComplete="off" placeholder="e.g. 50" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => touch("targetQty")} />}
          </Field>
          <Field label="Actual fabric used (yards)" error={show("actualFabricYds")}>
            {(p) => <input {...p} inputMode="decimal" autoComplete="off" placeholder="e.g. 92.5" value={yards} onChange={(e) => setYards(e.target.value)} onBlur={() => touch("actualFabricYds")} />}
          </Field>
        </div>
        <Field label="Fabric roll ID" error={show("fabricRollId")}>
          {(p) => <input {...p} autoComplete="off" placeholder="e.g. FAB-ROLL-882" value={roll} onChange={(e) => setRoll(e.target.value)} onBlur={() => touch("fabricRollId")} />}
        </Field>

        {recipe && (
          <div className="card p-3" aria-live="polite">
            <p className="text-sm font-extrabold">Expected cut components {qtyN ? `for ${qtyN} garments` : ""}</p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {recipe.components.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1">{c.name}</td>
                    <td className="py-1 text-[var(--ink-2)]">{c.piecesPerGarment} pc / garment</td>
                    <td className="font-num py-1 text-right font-bold">{qtyN ? c.piecesPerGarment * qtyN : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {qtyN && <p className="mt-2 text-sm">Expected fabric: <span className="font-num font-bold">{(qtyN * recipe.stdFabricYards).toFixed(2)} yd</span></p>}
          </div>
        )}

        {formErr && Object.keys(serverErr).length === 0 && <p role="alert" className="banner-error">{formErr}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create order"}</button>
        </div>
      </form>
    </Modal>
  );
}
