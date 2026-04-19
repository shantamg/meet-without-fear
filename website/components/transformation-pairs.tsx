"use client";

import { useEffect, useState } from "react";

type Pair = { from: string; to: string };

const PAIRS: Pair[] = [
  { from: "Heated", to: "Heard" },
  { from: "Enemy", to: "Human" },
  { from: "Blame", to: "Needs" },
  { from: "Opposition", to: "Win–Win" },
];

const CYCLE_MS = 3600;

export function TransformationPairs() {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % PAIRS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // Reduced-motion fallback: stack all pairs as a quiet static list so the
  // content stays readable without animation.
  if (reducedMotion) {
    return (
      <ul className="space-y-4 text-center">
        {PAIRS.map((p) => (
          <li key={p.from} className="font-display text-3xl text-foreground sm:text-4xl">
            <span className="text-muted-foreground">{p.from}</span>
            <span className="mx-4 text-brand-blue">→</span>
            <span>{p.to}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className="relative mx-auto flex h-[88px] w-full max-w-xl items-center justify-center sm:h-[120px]"
      role="status"
      aria-live="polite"
      aria-label={`${PAIRS[index].from} to ${PAIRS[index].to}`}
    >
      {PAIRS.map((p, i) => {
        const isActive = i === index;
        return (
          <div
            key={p.from}
            aria-hidden={!isActive}
            className={[
              "absolute inset-0 flex items-center justify-center transition-all duration-700 ease-out",
              isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
            ].join(" ")}
          >
            <span className="font-display text-4xl leading-none text-muted-foreground sm:text-6xl md:text-7xl">
              {p.from}
            </span>
            <span className="mx-4 text-2xl text-brand-blue sm:mx-6 sm:text-3xl md:mx-8" aria-hidden>
              →
            </span>
            <span className="font-display text-4xl leading-none text-foreground sm:text-6xl md:text-7xl">
              {p.to}
            </span>
          </div>
        );
      })}
      {/* Progress pips — tell the reader there's a rhythm, let them count. */}
      <div className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 gap-2 sm:-bottom-8">
        {PAIRS.map((p, i) => (
          <span
            key={p.from}
            className={[
              "h-1.5 w-1.5 rounded-full transition-colors duration-500",
              i === index ? "bg-brand-orange" : "bg-border",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
