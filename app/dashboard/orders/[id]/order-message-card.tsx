"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import { OrderMessageThread } from "./order-message-thread";
import { stripHtml } from "@/lib/html";
import type { ActionResult } from "@/lib/action-result";
import type { OrderMessage } from "@/lib/types";

export function OrderMessageCard({
  title,
  placeholder,
  messages,
  senderNames,
  sendAction,
}: {
  title: string;
  placeholder: string;
  messages: OrderMessage[];
  senderNames: Record<string, { name: string; email: string | null }>;
  sendAction: (subject: string, message: string) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  function handleSend() {
    if (!stripHtml(message).trim()) {
      toast.error("Write a message first.");
      return;
    }
    startTransition(async () => {
      const result = await sendAction(subject, message);
      if (result.success) {
        toast.success("Message sent");
        setSubject("");
        setMessage("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <Send className="h-3.5 w-3.5 text-muted-foreground" />
        <Label>{title}</Label>
      </div>

      <div className="mt-3">
        <OrderMessageThread messages={messages} senderNames={senderNames} />
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)..." />
        <RichTextEditor value={message} onChange={setMessage} placeholder={placeholder} />
        <Button type="button" disabled={isPending} onClick={handleSend} className="w-full">
          {title}
        </Button>
      </div>
    </div>
  );
}
