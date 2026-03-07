"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: "#171717", color: "#e5e5e5", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "center", paddingTop: "4rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Something went wrong</h1>
          <p style={{ color: "#a3a3a3", marginBottom: "0.5rem" }}>
            {error.message}
          </p>
          {error.digest && (
            <p style={{ color: "#737373", fontSize: "0.75rem", marginBottom: "1.5rem" }}>
              Digest: {error.digest}
            </p>
          )}
          <pre style={{ textAlign: "left", background: "#262626", padding: "1rem", borderRadius: "0.5rem", overflow: "auto", fontSize: "0.75rem", color: "#f87171", marginBottom: "1.5rem" }}>
            {error.stack}
          </pre>
          <button
            onClick={reset}
            style={{ background: "#10b981", color: "white", border: "none", padding: "0.75rem 1.5rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
