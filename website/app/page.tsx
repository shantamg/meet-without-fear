import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Heart, Shield, MessageCircle, Users } from "lucide-react";

import { TransformationPairs } from "@/components/transformation-pairs";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      {/* Gradient Top Bar */}
      <div className="h-1 bg-gradient-top" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Meet Without Fear" width={44} height={36} />
            <span className="hidden min-[430px]:inline font-display text-xl text-foreground">meet</span>
            <span className="hidden min-[430px]:inline font-display text-xl text-brand-cyan">without fear</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/app"
              className="hidden min-[430px]:inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-4 py-2 text-sm font-medium text-brand-orange transition-colors hover:bg-brand-orange/20"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        {/* Ambient color wash — two soft orbs drifting behind the hero. */}
        <div className="aurora" aria-hidden />
        <div className="grain" aria-hidden />

        <div className="container relative z-10 mx-auto px-6 pb-28 pt-20 text-center sm:pt-28">
          {/* Small logo — it was a 220px anchor before; now it's a grace note. */}
          <div className="mb-6 flex justify-center">
            <Image src="/logo.svg" alt="" width={84} height={70} priority />
          </div>

          {/* Wordmark in display serif — warm, human. */}
          <h1 className="mb-3 font-display text-5xl leading-[0.95] text-foreground sm:text-6xl md:text-7xl">
            Meet Without Fear
          </h1>

          {/* Kicker under wordmark — quiet, italicized-feeling aside. */}
          <p className="mx-auto mb-16 max-w-xl text-base text-muted-foreground sm:text-lg">
            A quieter way through the conversations that matter most.
          </p>

          {/* Animated transformation pair — the real hero. */}
          <div className="mb-20">
            <TransformationPairs />
          </div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-orange px-8 py-4 text-base font-semibold text-accent-foreground transition-all hover:scale-[1.02] hover:bg-brand-orange/90"
            >
              Get Started
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#how-it-feels"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-8 py-4 text-base text-foreground/80 transition-colors hover:border-brand-cyan/60 hover:text-foreground"
            >
              See how it feels
            </a>
          </div>
        </div>
      </section>

      {/* How a session feels — 3 beats in display serif. */}
      <section id="how-it-feels" className="relative border-y border-border bg-background-elevated/40 py-24 sm:py-32">
        <div className="container mx-auto max-w-5xl px-6">
          <p className="mb-16 text-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            How a session feels
          </p>

          <ol className="grid gap-12 sm:grid-cols-3 sm:gap-10">
            {SESSION_BEATS.map((beat, i) => (
              <li key={beat.title} className="relative">
                <div className="mb-5 font-display text-sm text-brand-orange">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mb-3 font-display text-2xl leading-tight text-foreground sm:text-3xl">
                  {beat.title}
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {beat.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 sm:py-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Why Meet Without Fear
            </p>
            <h2 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
              Built for the conversations you've been avoiding.
            </h2>
          </div>
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<Heart className="h-5 w-5" strokeWidth={1.75} />}
              accent="text-brand-orange"
              title="Feel heard"
              description="Speak to the system, not across the table. Your words come back clearly and calmly."
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" strokeWidth={1.75} />}
              accent="text-brand-blue"
              title="Neutral ground"
              description="The AI doesn't take sides. It helps both of you feel understood without judgment."
            />
            <FeatureCard
              icon={<MessageCircle className="h-5 w-5" strokeWidth={1.75} />}
              accent="text-brand-cream"
              title="Your memory"
              description="Your history stays with you. Switch models, change devices — the context follows."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" strokeWidth={1.75} />}
              accent="text-brand-orange"
              title="Shared understanding"
              description="Move past blame and defensiveness. Find the needs underneath and a way forward."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="aurora opacity-60" aria-hidden />
        <div className="container relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-6 font-display text-4xl leading-tight text-foreground sm:text-5xl">
            Ready when you are.
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Open Meet Without Fear and begin — no download, no setup. Just the conversation you've been putting off.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-orange px-10 py-4 text-base font-semibold text-accent-foreground transition-all hover:scale-[1.02] hover:bg-brand-orange/90"
          >
            Get Started
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Meet Without Fear</p>
          <p className="font-display italic text-foreground/70">Heard. Human. Whole.</p>
        </div>
      </footer>
    </main>
  );
}

const SESSION_BEATS = [
  {
    title: "You speak in full.",
    body: "Type or speak, without being cut off. The system hears what you meant, not just what you said.",
  },
  {
    title: "It reflects, softly.",
    body: "Your words come back to you — gentler, clearer. You choose what to share, and how.",
  },
  {
    title: "They hear you.",
    body: "Your partner receives what you chose, on their own time. No shouting over each other, no bracing.",
  },
] as const;

function FeatureCard({
  icon,
  accent,
  title,
  description,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-border bg-card/60 p-7 transition-colors hover:border-brand-cyan/40">
      <div className={`mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background-elevated ${accent}`}>
        {icon}
      </div>
      <h3 className="mb-2 font-display text-xl text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
