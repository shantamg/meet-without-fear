"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function Providers({ children }: { children: React.ReactNode }) {
  // During build time on Vercel, the env var might not be available
  // In that case, render children without ClerkProvider (static pages will work)
  // At runtime, ClerkProvider will be used with the key from the environment
  if (!publishableKey) {
    return <>{children}</>;
  }

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
      {children}
    </ClerkProvider>
  );
}
