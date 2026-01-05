"use client";

import { useEffect } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { InvitationRedirect } from "./invitation-redirect";
import { AuthTracker } from "./auth-tracker";
import { initMixpanel } from "@/lib/mixpanel";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize Mixpanel on mount
  useEffect(() => {
    initMixpanel();
  }, []);

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#6366f1",
          colorBackground: "#171717",
          colorInputBackground: "#262626",
          colorInputText: "#e5e5e5",
        },
      }}
    >
      <AuthTracker />
      <InvitationRedirect />
      {children}
    </ClerkProvider>
  );
}
