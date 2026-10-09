import type { OrderStatus } from "@/db/schema";
import { HttpError } from "@/server/errors";


export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  IN_PROGRESS: ["PENDING_VERIFICATION"],
  PENDING_VERIFICATION: ["VERIFIED", "REJECTED"],
  REJECTED: ["PENDING_VERIFICATION"],
  VERIFIED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new HttpError(422, `Illegal status transition: ${from} -> ${to}`);
  }
}
