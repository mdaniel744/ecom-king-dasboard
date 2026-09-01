import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  if (process.env.LOCAL_DEMO_MODE === "true") redirect("/dashboard");

  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/sign-in");
}
