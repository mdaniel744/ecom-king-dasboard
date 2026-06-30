"use client";

import { useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteTeammate, removeTeammate, type TeamMember } from "@/app/dashboard/settings/team-actions";

export function TeamSection({
  members,
  isCurrentUserOwner,
}: {
  members: TeamMember[];
  isCurrentUserOwner: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team</CardTitle>
        <p className="text-sm text-muted-foreground">
          Everyone listed here has full, equal access to this store&apos;s
          products, categories, attributes, and Google Merchant sync.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{member.name ?? member.email}</p>
                {member.name && (
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.isOwner ? "default" : "secondary"}>
                  {member.isOwner ? "Owner" : member.role}
                </Badge>
                {isCurrentUserOwner && !member.isOwner && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await removeTeammate(member.userId);
                        if (!result.success) setError(result.error ?? "Failed to remove teammate.");
                      });
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isCurrentUserOwner ? (
          <form
            ref={formRef}
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                const result = await inviteTeammate(formData);
                if (result.success) {
                  formRef.current?.reset();
                } else {
                  setError(result.error ?? "Failed to invite teammate.");
                }
              });
            }}
            className="flex items-end gap-2 border-t border-border pt-4"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invite_email">Invite a teammate</Label>
              <Input
                id="invite_email"
                name="email"
                type="email"
                required
                placeholder="they must already have a Clerk account"
              />
            </div>
            <div className="w-32 space-y-1.5">
              <Label htmlFor="invite_role">Role</Label>
              <Select name="role" defaultValue="manager">
                <SelectTrigger id="invite_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add"}
            </Button>
          </form>
        ) : (
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Only the store owner can invite or remove teammates.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
