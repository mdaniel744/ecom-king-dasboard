import { redirect } from "next/navigation";

// Self-serve sign-up is intentionally disabled — accounts are created
// manually in the Clerk dashboard and credentials are handed to clients
// directly, rather than allowing public registration.
export default function SignUpPage() {
  redirect("/sign-in");
}
