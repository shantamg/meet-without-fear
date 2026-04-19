import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Derive __dirname in an ESM-safe way — Next 16 loads config as ESM, so the
// CommonJS `__dirname` global is undefined.
const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Disable Next.js dev indicator
  devIndicators: false,

  // Pin Turbopack's workspace root to the monorepo root. `next` is hoisted
  // there by npm workspaces, so restricting the root to website/ alone makes
  // it unresolvable. Without this pin, Next 16's multi-lockfile heuristic
  // picks different roots on different machines and fails the build on CI.
  turbopack: {
    root: path.resolve(here, ".."),
  },

  // Configure environment variables that can be exposed to the browser
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
};

export default nextConfig;
