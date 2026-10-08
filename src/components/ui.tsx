"use client";
import { useEffect, useId, useRef } from "react";
import type { LightStatus, OrderStatus } from "@/db/schema";

const STATUS_STYLE: Record<OrderStatus, { cls: string; label: string }> = {
  IN_PROGRESS: { cls: "b-gray", label: "Cutting in progress" },
  PENDING_VERIFICATION: { cls: "b-blue", label: "Pending verification" },
  REJECTED: { cls: "b-red", label: "Rejected" },
  VERIFIED: { cls: "b-green", label: "Verified" },
};
export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

const LIGHT: Record<LightStatus, { cls: string; icon: string; label: string }> = {
  GREEN: { cls: "b-green", icon: "●", label: "GREEN · Match" },
  YELLOW: { cls: "b-yellow", icon: "▲", label: "YELLOW · Excess" },
  RED: { cls: "b-red", icon: "✖", label: "RED · Shortage" },
};
/** Colour is never the only signal: each light also has an icon and a text label. */
export function LightBadge({ status }: { status: LightStatus | null }) {
  if (!status) return <span className="badge b-gray">○ Not counted</span>;
  const l = LIGHT[status];
  return <span className={`badge ${l.cls}`} data-testid={`light-${status}`}><span aria-hidden>{l.icon}</span>{l.label}</span>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (p: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode }) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="mt-1">{children({ id, "aria-invalid": !!error, "aria-describedby": error || hint ? msgId : undefined })}</div>
      {error ? <p id={msgId} role="alert" className="field-error"><span aria-hidden>⚠</span>{error}</p>
        : hint ? <p id={msgId} className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-2xl p-5 shadow-2xl outline-none sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="p-6 font-semibold text-[var(--ink-2)]" role="status">{label}</p>;
}
