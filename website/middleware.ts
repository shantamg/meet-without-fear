import { clerkMiddleware } from "@clerk/nextjs/server";

// Simple middleware - all routes are public
// Auth verification happens on the backend (Render) when API calls are made
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
