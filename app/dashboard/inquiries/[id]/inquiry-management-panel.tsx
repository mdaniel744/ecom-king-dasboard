"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  setInquiryStatus,
  updateInquiryAdminNotes,
} from "@/app/dashboard/inquiries/actions";
import type { InquiryStatus } from "@/lib/types";

export function InquiryManagementPanel({
  inquiryId,
  status,
  initialNotes,
}: {
  inquiryId: string;
  status: InquiryStatus;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [isPending, startTransition] = useTransition();
  const nextStatus: InquiryStatus = status === "open" ? "closed" : "open";

  const updateStatus = () => {
    startTransition(async () => {
      const result = await setInquiryStatus(inquiryId, nextStatus);
      if (result.success) toast.success(`Inquiry marked ${nextStatus}`);
      else toast.error(result.error ?? "Could not update the inquiry.");
    });
  };

  const saveNotes = () => {
    startTransition(async () => {
      const result = await updateInquiryAdminNotes(inquiryId, notes);
      if (result.success) toast.success("Internal notes saved");
      else toast.error(result.error ?? "Could not save the notes.");
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <p className="font-medium">Inquiry management</p>
        <p className="text-sm text-muted-foreground">
          Track whether this request still needs attention and keep private staff notes.
        </p>
      </div>

      <Button type="button" variant="outline" disabled={isPending} onClick={updateStatus}>
        Mark as {nextStatus === "closed" ? "Closed" : "Open"}
      </Button>

      <div className="space-y-2">
        <label htmlFor="inquiry-admin-notes" className="text-sm font-medium">
          Internal notes
        </label>
        <Textarea
          id="inquiry-admin-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add follow-up notes, quote information, or staff context…"
          rows={6}
          maxLength={5000}
        />
        <Button type="button" disabled={isPending || notes === initialNotes} onClick={saveNotes}>
          Save Notes
        </Button>
      </div>
    </div>
  );
}
