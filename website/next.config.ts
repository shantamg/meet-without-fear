import type { NextConfig } from "next";

const defaultAppUrl =
  process.env.NODE_ENV === "production"
    ? "https://app.meetwithoutfear.com/"
    : "http://localhost:3001";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Disable Next.js dev indicator
  devIndicators: false,

  // Configure environment variables that can be exposed to the browser
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  },
};

export default nextConfig;
