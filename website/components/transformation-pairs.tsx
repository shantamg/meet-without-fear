"use client";

import { useEffect, useState } from "react";

type Pair = { from: string; to: string };

const PAIRS: Pair[] = [
  { from: "Heated", to: "Heard" },
  { from: "Enemy", to: "Human" },
  { from: "Blame", to: "Needs" },
  { from: "Opposition", to: "Win-win" },
];

const CYCLE_MS = 2600;
const FADE_OUT_MS = 300;
const FADE_IN_MS = 460;

export function TransformationPairs() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
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
    let swapTimeout: number | undefined;

    const id = window.setInterval(() => {
      setVisible(false);
      swapTimeout = window.setTimeout(() => {
        setIndex((i) => (i + 1) % PAIRS.length);
        setVisible(true);
      }, FADE_OUT_MS);
    }, CYCLE_MS);

    return () => {
      window.clearInterval(id);
      if (swapTimeout !== undefined) {
        window.clearTimeout(swapTimeout);
      }
    };
  }, [reducedMotion]);

  // Reduced-motion fallback: stack all pairs as a quiet static list so the
  // content stays readable without animation.
  if (reducedMotion) {
    return (
      <ul className="space-y-4 text-center">
        {PAIRS.map((p) => (
          <li
            key={p.from}
            className="font-display text-3xl text-foreground whitespace-nowrap sm:text-4xl"
          >
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
      className="relative mx-auto flex h-[72px] w-full max-w-xl items-center justify-center sm:h-[96px] md:h-[120px]"
      role="status"
      aria-live="polite"
      aria-label={`${PAIRS[index].from} to ${PAIRS[index].to}`}
    >
      <div
        className={[
          // A single rendered phrase matches the app animation: fade out,
          // swap while invisible, then fade in so phrases never collide.
          "absolute inset-0 flex items-center justify-center whitespace-nowrap transition-all",
          visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        ].join(" ")}
        style={{
          transitionDuration: `${visible ? FADE_IN_MS : FADE_OUT_MS}ms`,
          transitionTimingFunction: visible
            ? "cubic-bezier(0.215, 0.61, 0.355, 1)"
            : "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
        }}
      >
        <span className="font-display text-[clamp(1.375rem,7.2vw,4.5rem)] leading-none text-muted-foreground">
          {PAIRS[index].from}
        </span>
        <span
          className="mx-3 text-[clamp(1rem,4vw,2rem)] text-brand-blue sm:mx-5 md:mx-7"
          aria-hidden
        >
          →
        </span>
        <span className="font-display text-[clamp(1.375rem,7.2vw,4.5rem)] leading-none text-foreground">
          {PAIRS[index].to}
        </span>
      </div>
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
