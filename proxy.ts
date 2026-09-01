import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const publicRoutes = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/feeds(.*)",
  // Called by Postgres triggers (pg_net), not signed-in users. Each endpoint
  // authenticates its request with its own shared webhook secret.
  "/api/inquiries/notify",
  "/api/orders/invoice",
  "/api/submissions/notify",
  ...(process.env.LOCAL_DEMO_MODE === "true"
    ? ["/dashboard(.*)", "/api/products/export", "/api/products/import"]
    : []),
];

const isPublicRoute = createRouteMatcher(publicRoutes);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html|css|js|gif|svg|jpg|jpeg|png|woff|woff2|ico|csv|docx|xlsx|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
