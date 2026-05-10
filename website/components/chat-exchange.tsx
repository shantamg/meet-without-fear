"use client";

import { useEffect, useRef, useState } from "react";

type Beat =
  | { kind: "type"; speaker: "raw" | "heard"; text: string; cps?: number }
  | { kind: "pause"; ms: number }
  | { kind: "showArrow" }
  | { kind: "fadeRaw" };

const PAIRS: { raw: string; heard: string }[] = [
  { raw: "She doesn't see what I do for us.", heard: "I'm scared I'm not enough." },
  { raw: "You always make it about you.", heard: "I miss being chosen." },
  { raw: "I shouldn't have to ask.", heard: "It hurt that you didn't notice." },
  { raw: "Why are you so defensive?", heard: "I'm afraid you'll leave if I push." },
  { raw: "You're overreacting.", heard: "I don't know how to comfort you." },
  { raw: "Forget it.", heard: "I'm scared you won't get it." },
  { raw: "You never listen.", heard: "I feel alone in this." },
];

const SCRIPTS: Beat[][] = PAIRS.map(({ raw, heard }) => [
  { kind: "type", speaker: "raw", text: raw, cps: 19 },
  { kind: "showArrow" },
  { kind: "pause", ms: 350 },
  { kind: "fadeRaw" },
  { kind: "pause", ms: 150 },
  { kind: "type", speaker: "heard", text: heard, cps: 36 },
  { kind: "pause", ms: 2800 },
]);

const CPS = 36;

export function ChatExchange() {
  const [scriptIx, setScriptIx] = useState(0);
  const [rawText, setRawText] = useState("");
  const [heardText, setHeardText] = useState("");
  const [heardRevealed, setHeardRevealed] = useState(0);
  const [typing, setTyping] = useState<"raw" | "heard" | null>("raw");
  const [arrowVisible, setArrowVisible] = useState(false);
  const [rawFaded, setRawFaded] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const cancelled = useRef(false);

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
    cancelled.current = false;
    const timers = new Set<number>();
    const sleep = (ms: number) =>
      new Promise<void>((r) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          r();
        }, ms);
        timers.add(id);
      });

    const run = async () => {
      const script = SCRIPTS[scriptIx];
      setExiting(false);
      setRawText("");
      // Pre-fill the heard text so the bubble has its full natural height
      // from the very first paint — no layout shift mid-slide.
      setHeardText(PAIRS[scriptIx].heard);
      setHeardRevealed(0);
      setArrowVisible(false);
      setRawFaded(false);
      setTyping("raw");

      for (const beat of script) {
        if (cancelled.current) return;
        if (beat.kind === "pause") {
          await sleep(beat.ms);
        } else if (beat.kind === "showArrow") {
          setArrowVisible(true);
        } else if (beat.kind === "fadeRaw") {
          setRawFaded(true);
        } else {
          setTyping(beat.speaker);
          if (beat.speaker === "heard") {
            // AI-style word-by-word fade-in for the reframed line.
            const words = beat.text.split(/\s+/).filter(Boolean);
            for (let w = 1; w <= words.length; w++) {
              if (cancelled.current) return;
              setHeardRevealed(w);
              await sleep(140 + Math.random() * 140);
            }
          } else {
            const cps = beat.cps ?? CPS;
            const baseStep = 1000 / cps;
            for (let i = 1; i <= beat.text.length; i++) {
              if (cancelled.current) return;
              const ch = beat.text[i - 1];
              setRawText(beat.text.slice(0, i));
              const jitter = 0.4 + Math.random() * 2.0;
              const punct = /[.,!?]/.test(ch) ? 280 + Math.random() * 280 : 0;
              const thinking = Math.random() < 0.05 ? 200 + Math.random() * 300 : 0;
              await sleep(baseStep * jitter + punct + thinking);
            }
          }
          setTyping(null);
        }
      }

      if (cancelled.current) return;
      setExiting(true);
      await sleep(500);
      if (cancelled.current) return;
      // Reset every visible piece in the SAME batch as the script index change,
      // so the next pair's container mounts with empty/dim state — no flash.
      setExiting(false);
      setRawText("");
      setHeardText("");
      setHeardRevealed(0);
      setArrowVisible(false);
      setRawFaded(false);
      setTyping("raw");
      setScriptIx((i) => (i + 1) % SCRIPTS.length);
    };

    run();

    return () => {
      cancelled.current = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [scriptIx, reducedMotion]);

  if (reducedMotion) {
    const { raw, heard } = PAIRS[0];
    const heardWords = heard.split(/\s+/).filter(Boolean);
    return (
      <div className="flex flex-col items-center">
        <Bubble side="raw" text={raw} caret={false} />
        <div className="mt-4 flex flex-col items-center gap-4">
          <Arrow visible />
          <HeardBubble words={heardWords} revealed={heardWords.length} />
        </div>
      </div>
    );
  }

  return (
    <div
      key={scriptIx}
      className={[
        "flex flex-col items-center",
        exiting ? "-translate-y-3 opacity-0 transition-all duration-500 ease-out" : "",
      ].join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <Bubble
        side="raw"
        text={rawText}
        caret={typing === "raw"}
        faded={rawFaded}
        dim={rawText.length === 0}
      />
      {/* Expandable region: max-height grows past the content size, so the
          visual animation completes when content height is reached — no
          end-of-transition snap. Parent flex keeps the stack centered as it
          grows, sliding the raw bubble upward smoothly. */}
      <div
        className={[
          // On mobile keep the space always reserved (no layout shift).
          // On lg+ animate from collapsed to expanded so the stack slides up.
          "w-full overflow-hidden max-h-[260px] transition-[max-height] duration-[800ms] ease-in-out",
          arrowVisible ? "lg:max-h-[260px]" : "lg:max-h-0",
        ].join(" ")}
      >
        <div className="flex flex-col items-center gap-4 px-3 pb-8 pt-4">
          <Arrow visible={arrowVisible} />
          <HeardBubble
            words={heardText.split(/\s+/).filter(Boolean)}
            revealed={heardRevealed}
            dim={heardRevealed === 0}
          />
        </div>
      </div>
    </div>
  );
}

function Arrow({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 32"
      className={[
        "h-9 w-6 text-brand-orange transition-opacity duration-500 sm:h-11 sm:w-7",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 V28" />
      <path d="M5 21 L12 28 L19 21" />
    </svg>
  );
}

function HeardBubble({
  words,
  revealed,
  dim,
}: {
  words: string[];
  revealed: number;
  dim?: boolean;
}) {
  return (
    <div
      className={[
        "flex justify-center transition-opacity duration-700",
        dim ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <div className="relative whitespace-nowrap rounded-2xl bg-[var(--accent-soft)] px-7 py-5 text-center text-[clamp(1.125rem,3.6vw,1.5rem)] leading-[1.35] text-foreground shadow-[0_1px_0_0_rgba(28,25,20,0.04),0_10px_28px_-12px_rgba(183,116,47,0.4)]">
        <span className="font-display italic">
          {words.length === 0 ? (
            " "
          ) : (
            words.map((w, i) => (
              <span
                key={i}
                className="transition-opacity duration-500 ease-out"
                style={{
                  opacity: i < revealed ? 1 : 0,
                  display: "inline-block",
                }}
              >
                {w}
                {i < words.length - 1 ? " " : ""}
              </span>
            ))
          )}
        </span>
      </div>
    </div>
  );
}

function Bubble({
  side,
  text,
  caret,
  dim,
  faded,
}: {
  side: "raw" | "heard";
  text: string;
  caret: boolean;
  dim?: boolean;
  faded?: boolean;
}) {
  const isRaw = side === "raw";
  return (
    <div
      className={[
        "flex justify-center transition-opacity duration-700",
        dim ? "opacity-0" : faded ? "opacity-30" : "opacity-100",
      ].join(" ")}
    >
      <div
        className={[
          "relative whitespace-nowrap rounded-2xl px-7 py-5 text-center text-[clamp(1.125rem,3.6vw,1.5rem)] leading-[1.35]",
          isRaw
            ? "bg-card text-foreground shadow-[0_1px_0_0_rgba(28,25,20,0.04),0_10px_28px_-12px_rgba(28,25,20,0.2)]"
            : "bg-[var(--accent-soft)] text-foreground shadow-[0_1px_0_0_rgba(28,25,20,0.04),0_8px_24px_-12px_rgba(183,116,47,0.4)]",
        ].join(" ")}
      >
        <span className="font-display italic">{text || " "}</span>
        <span
          className="caret"
          aria-hidden
          style={{ visibility: caret ? "visible" : "hidden" }}
        />
      </div>
    </div>
  );
}
