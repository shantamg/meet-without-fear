"use client";

import Link from "next/link";

export default function InvitationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-lg">
        <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>
        <p className="text-muted-foreground mb-2">{error.message}</p>
        <pre className="text-left bg-card p-4 rounded-xl overflow-auto text-xs text-red-400 mb-6 max-h-48">
          {error.stack}
        </pre>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold hover:bg-accent/90 transition-all"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground px-6 py-3"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
