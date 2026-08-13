import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize-html";
import type { OrderMessage, OrderMessageSender } from "@/lib/types";

const SENDER_LABEL: Record<OrderMessageSender, string> = {
  buyer: "Buyer",
  dealer: "Dealer",
  admin: "Staff",
  system: "Automated",
};

const SENDER_CLASS: Record<OrderMessageSender, string> = {
  buyer: "bg-blue-100 text-blue-900",
  dealer: "bg-purple-100 text-purple-900",
  admin: "bg-primary/10 text-primary",
  system: "bg-muted text-muted-foreground",
};

export function OrderMessageThread({
  messages,
  senderNames,
}: {
  messages: OrderMessage[];
  senderNames: Record<string, { name: string; email: string | null }>;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet on this order.</p>;
  }

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto">
      {messages.map((m) => {
        const senderName =
          m.sender === "buyer" || m.sender === "dealer" ? senderNames[m.sender_user_id]?.name : null;
        return (
          <div key={m.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", SENDER_CLASS[m.sender])}>
                  {SENDER_LABEL[m.sender]}
                </span>
                {senderName && <span className="text-xs text-muted-foreground">{senderName}</span>}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
            </div>
            {m.subject && <p className="mt-1.5 text-sm font-medium">{m.subject}</p>}
            {/* Sanitized for every sender, not just trusted admin content —
                buyer/dealer messages can be rich HTML from the storefront's
                own composer too, and that's external input regardless of
                how much we trust the storefront's own code. */}
            <div
              className="prose prose-sm mt-1 max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.message) }}
            />
          </div>
        );
      })}
    </div>
  );
}
