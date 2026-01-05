"use client";

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { trackSignIn, resetUser } from "@/lib/mixpanel";

const TRACKED_SESSION_KEY = "mwf_tracked_session";

/**
 * Tracks sign-in/sign-up events via Mixpanel.
 * Must be rendered inside ClerkProvider.
 */
export function AuthTracker() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const prevSignedIn = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    // Detect sign-in transition (was not signed in, now is)
    if (isSignedIn && user && prevSignedIn.current === false) {
      const userId = user.id;
      const trackedSession = sessionStorage.getItem(TRACKED_SESSION_KEY);

      // Only track once per session to avoid duplicate events on page navigations
      if (trackedSession !== userId) {
        // Determine provider from user's external accounts
        const provider =
          user.externalAccounts?.[0]?.provider || "unknown";

        // Check if this is a new user (created within the last minute)
        const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
        const isNewUser = Date.now() - createdAt < 60000;

        trackSignIn(provider, userId, isNewUser);
        sessionStorage.setItem(TRACKED_SESSION_KEY, userId);
      }
    }

    // Detect sign-out transition
    if (!isSignedIn && prevSignedIn.current === true) {
      resetUser();
      sessionStorage.removeItem(TRACKED_SESSION_KEY);
    }

    prevSignedIn.current = isSignedIn;
  }, [isLoaded, isSignedIn, user]);

  return null;
}
