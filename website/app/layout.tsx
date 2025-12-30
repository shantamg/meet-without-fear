import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
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
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
