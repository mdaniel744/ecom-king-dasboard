import type { OrderEscrowStatus } from "@/lib/types";

// Shared between the Orders list and the order detail page — kept in one
// place so the two views can never drift on labels/colors/step mapping.

export const STATUS_LABEL: Record<OrderEscrowStatus, string> = {
  pending_review: "Pending Dealer Review",
  dealer_accepted: "Dealer Accepted",
  funds_secured: "Funds Secured",
  shipped: "Shipped",
  verified: "Delivery Confirmed",
  funds_released: "Funds Released to Dealer",
  cancelled: "Order Cancelled",
};

export const STATUS_CLASS: Record<OrderEscrowStatus, string> = {
  pending_review: "border-transparent bg-amber-100 text-amber-900",
  dealer_accepted: "border-transparent bg-blue-100 text-blue-900",
  funds_secured: "border-transparent bg-emerald-100 text-emerald-900",
  shipped: "border-transparent bg-indigo-100 text-indigo-900",
  verified: "border-transparent bg-teal-100 text-teal-900",
  funds_released: "border-transparent bg-green-200 text-green-950",
  cancelled: "border-transparent bg-red-100 text-red-900",
};

export function orderRef(id: string): string {
  return `KRV-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

// The 6-step buyer-facing tracker doesn't map 1:1 to the 7 escrow_status
// values — "cancelled" is a terminal side-branch, not a step. stepIndex is
// null for cancelled orders, since the tracker isn't shown for those.
export const STEP_LABELS = ["Order Placed", "Dealer Confirmed", "Payment Secured", "Shipped", "Delivered", "Complete"] as const;

export function escrowStepIndex(status: OrderEscrowStatus): number | null {
  switch (status) {
    case "pending_review":
      return 1;
    case "dealer_accepted":
      return 2;
    case "funds_secured":
      return 3;
    case "shipped":
      return 4;
    case "verified":
      return 5;
    case "funds_released":
      return 6;
    case "cancelled":
      return null;
  }
}

export const STATUS_BANNER: Record<OrderEscrowStatus, string> = {
  pending_review: "Order received — verifying availability with the dealer.",
  dealer_accepted: "Dealer confirmed availability. Waiting on the buyer's payment.",
  funds_secured: "Payment is secured in escrow. Ready to ship.",
  shipped: "Marked as shipped. Waiting on delivery confirmation.",
  verified: "Delivery confirmed by the buyer. Ready to release funds to the dealer.",
  funds_released: "Complete — funds have been released to the dealer.",
  cancelled: "This order has been cancelled.",
};

// The one valid "advance" action per status — deliberately not a free
// jump-to-any-state dropdown, so staff can't accidentally skip or reorder
// escrow steps. null = terminal state, nothing to advance to.
export const NEXT_ACTION: Partial<Record<OrderEscrowStatus, { label: string; next: OrderEscrowStatus }>> = {
  pending_review: { label: "Confirm Dealer Accepted", next: "dealer_accepted" },
  dealer_accepted: { label: "Confirm Funds Secured", next: "funds_secured" },
  funds_secured: { label: "Confirm Shipped", next: "shipped" },
  shipped: { label: "Confirm Delivered", next: "verified" },
  verified: { label: "Confirm Complete", next: "funds_released" },
};

// Cancel is only offered while an order is still "in flight" — not once
// funds have already been released or it's already cancelled.
export const CANCELLABLE_STATUSES: OrderEscrowStatus[] = ["pending_review", "dealer_accepted", "funds_secured"];
