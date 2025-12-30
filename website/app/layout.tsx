import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Meet Without Fear",
  description: "Transform difficult conversations into opportunities for connection and understanding.",
  keywords: ["communication", "relationships", "conflict resolution", "therapy", "couples"],
  authors: [{ name: "Meet Without Fear" }],
  openGraph: {
    title: "Meet Without Fear",
    description: "Transform difficult conversations into opportunities for connection and understanding.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meet Without Fear",
    description: "Transform difficult conversations into opportunities for connection and understanding.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
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
      <html lang="en" className={inter.variable}>
        <body className="min-h-screen bg-background font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
