"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMail } from "@/lib/mailer";
import { getKarivUsersByIds } from "@/lib/kariv-clerk";
import { notifyUser } from "@/lib/notifications";
import { stripHtml } from "@/lib/html";
import { makeEmailSafeHtml } from "@/lib/email-html";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { OrderEscrowStatus } from "@/lib/types";

const ESCROW_STATUSES: OrderEscrowStatus[] = [
  "pending_review",
  "dealer_accepted",
  "funds_secured",
  "shipped",
  "verified",
  "funds_released",
  "cancelled",
];

// Buyer-facing copy per status — matches the language already shown on the
// storefront's own order-tracker steps, not our internal staff labels.
const STATUS_NOTIFICATION_COPY: Record<OrderEscrowStatus, { title: string; body: string }> = {
  pending_review: { title: "Order received", body: "We're verifying availability with the dealer." },
  dealer_accepted: {
    title: "Dealer confirmed your order",
    body: "Please proceed with payment to secure your order.",
  },
  funds_secured: { title: "Payment secured", body: "Your payment is safely held in escrow." },
  shipped: { title: "Your watch has shipped", body: "Tracking details are available on your order." },
  verified: { title: "Delivery confirmed", body: "Thanks for confirming receipt of your watch." },
  funds_released: { title: "Order complete", body: "Funds have been released to the dealer." },
  cancelled: { title: "Order cancelled", body: "This order has been cancelled." },
};

const escrowStatusSchema = z.object({
  orderId: z.string().uuid(),
  escrowStatus: z.enum(ESCROW_STATUSES as [OrderEscrowStatus, ...OrderEscrowStatus[]]),
});

export async function updateOrderEscrowStatus(orderId: string, escrowStatus: string): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = validate(escrowStatusSchema, { orderId, escrowStatus });

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .update({ escrow_status: fields.escrowStatus, updated_at: new Date().toISOString() })
      .eq("id", fields.orderId)
      .eq("store_id", store.id)
      .select("id, buyer_user_id")
      .single();

    if (error) throw error;

    if (order) {
      const copy = STATUS_NOTIFICATION_COPY[fields.escrowStatus];
      await notifyUser(store.id, order.buyer_user_id, {
        type: "escrow_status_changed",
        title: copy.title,
        body: copy.body,
        linkPath: `/portal/orders/${order.id}`,
      });
    }

    revalidatePath("/dashboard/orders");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

const trackingSchema = z.object({
  orderId: z.string().uuid(),
  trackingNumber: z.string().trim().max(200).nullable(),
});

export async function updateOrderTracking(orderId: string, trackingNumber: string): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = validate(trackingSchema, {
      orderId,
      trackingNumber: trackingNumber.trim() || null,
    });

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ tracking_number: fields.trackingNumber, updated_at: new Date().toISOString() })
      .eq("id", fields.orderId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/orders");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

const messageSchema = z.object({
  orderId: z.string().uuid(),
  subject: z.string().trim().max(200).nullable(),
  // message is rich-text HTML (Tiptap) — a "min length" on raw markup would
  // pass on an empty-looking "<p></p>", so emptiness is checked on the
  // stripped plain-text version instead. Max is generous to leave headroom
  // for markup overhead over the same visible text.
  message: z
    .string()
    .trim()
    .max(20000, "Message is too long")
    .refine((val) => stripHtml(val).trim().length > 0, "Message can't be empty"),
});

/**
 * Records a staff → buyer message (shows in the storefront's Mails tab via
 * order_messages) and, best-effort, emails the buyer the same content —
 * branded with this store's own sender name, not the generic platform one.
 */
export async function sendOrderMessageToBuyer(
  orderId: string,
  subject: string,
  message: string
): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const { userId } = await auth();
    const fields = validate(messageSchema, {
      orderId,
      subject: subject.trim() || null,
      message,
    });

    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, buyer_user_id")
      .eq("id", fields.orderId)
      .eq("store_id", store.id)
      .single();
    if (fetchError || !order) {
      return { success: false, error: "Order not found.", fieldErrors: {} };
    }

    const { error } = await supabaseAdmin.from("order_messages").insert({
      order_id: order.id,
      sender: "admin",
      sender_user_id: userId,
      subject: fields.subject,
      message: fields.message,
    });
    if (error) throw error;

    const buyers = await getKarivUsersByIds([order.buyer_user_id]);
    const buyerEmail = buyers.get(order.buyer_user_id)?.email;
    if (buyerEmail) {
      try {
        await sendMail({
          to: buyerEmail,
          fromName: store.notification_sender_name || store.name,
          subject: fields.subject || `Message about your order — ${store.name}`,
          html: `<div style="font-family: sans-serif; max-width: 560px;">${makeEmailSafeHtml(fields.message)}</div>`,
        });
      } catch {
        // best-effort — the in-app message (order_messages row above)
        // already succeeded, so don't fail the whole action over email
      }
    }

    await notifyUser(store.id, order.buyer_user_id, {
      type: "order_message",
      title: fields.subject || `New message about your order`,
      body: stripHtml(fields.message).slice(0, 150),
      linkPath: `/portal/orders/${order.id}`,
    });

    revalidatePath("/dashboard/orders");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
