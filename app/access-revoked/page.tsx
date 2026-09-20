import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function AccessRevokedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Your access has been removed</h1>
        <p className="text-muted-foreground">
          You no longer have access to this store's dashboard. If this isn't expected, contact
          the store owner — they can invite you again from Settings → Team.
        </p>
        <SignOutButton>
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>
    </main>
  );
}
