import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/app",
  "/app/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Invitation routes are semi-public - they check auth status themselves
  "/invitation/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // If it's not a public route, require authentication
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Match all routes except static files and API routes
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
