export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}, public details?: unknown) {
    super(message);
  }
}

/** Thin fetch wrapper. NOTE: it only transports data; every rule is re-checked on the server. */
export async function api<T>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details?.fields ?? {}, data?.details);
  }
  return data as T;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
