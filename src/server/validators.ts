import { z } from "zod";
import { HttpError } from "./errors";

/** Strict positive integer: rejects strings, decimals, negatives, NaN, empty. */
const posInt = (max: number, label: string) =>
  z.number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number (no decimals)`)
    .positive(`${label} must be greater than 0`)
    .max(max, `${label} must be at most ${max}`);

/** Whole number >= 0 (a physical count of zero is legal, it is simply a shortage). */
const countInt = z.number({ error: "Count must be a number" })
  .int("Count must be a whole number (no decimals)")
  .min(0, "Count cannot be negative")
  .max(1_000_000, "Count is unrealistically large");

/** Fabric yards: positive, up to 2 decimal places (fabric is measured in fractions of a yard). */
const yards = z.number({ error: "Fabric used must be a number" })
  .positive("Fabric used must be greater than 0")
  .max(1_000_000, "Fabric used is unrealistically large")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places");

export const createOrderSchema = z.object({
  recipeId: posInt(1_000_000, "Recipe"),
  targetQty: posInt(100_000, "Target batch quantity"),
  fabricRollId: z.string({ error: "Fabric roll ID is required" })
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/, "Fabric roll ID: 3-40 chars, letters/digits/hyphen (e.g. FAB-ROLL-882)"),
  actualFabricYds: yards,
}).strict();

export const saveCountsSchema = z.object({
  counts: z.array(z.object({
    componentId: posInt(1_000_000, "Component"),
    actualQty: countInt,
  }).strict()).min(1, "At least one component count is required").max(100),
}).strict().superRefine((v, ctx) => {
  const ids = v.counts.map((c) => c.componentId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate component in payload" });
});

export const approveSchema = z.object({
  note: z.string().trim().max(500, "Note is too long (max 500)").optional(),
}).strict();

export const rejectSchema = z.object({
  reason: z.string({ error: "A rejection reason is mandatory" })
    .trim()
    .min(5, "Rejection reason is mandatory (min 5 characters)")
    .max(500, "Rejection reason is too long (max 500)"),
}).strict();

export const loginSchema = z.object({
  email: z.string({ error: "Email is required" }).trim().toLowerCase().email("Enter a valid email"),
  password: z.string({ error: "Password is required" }).min(1, "Password is required").max(200),
}).strict();

/** Parse + throw a 400 HttpError with per-field messages. Never trusts the client payload shape. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const flat = z.flattenError(r.error);
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new HttpError(400, Object.values(fields)[0] ?? "Validation failed", { fields, form: flat.formErrors });
}
