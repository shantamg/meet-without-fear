import Link from "next/link";
import Image from "next/image";
import { ArrowRight, LockKeyhole, MessageCircle, Pause, Sparkles } from "lucide-react";

import { TransformationPairs } from "@/components/transformation-pairs";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Meet Without Fear home">
            <Image src="/logo.svg" alt="" width={40} height={34} priority />
            <span className="font-display text-xl italic text-foreground">meet without fear</span>
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
          >
            Open app
            <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl content-center justify-items-center px-5 pb-16 pt-12 text-center sm:px-6 lg:pb-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-center justify-center gap-3">
            <Image src="/logo.svg" alt="" width={72} height={60} priority />
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Guided conflict repair
            </p>
          </div>

          <h1 className="mx-auto max-w-3xl font-display text-5xl leading-[0.94] tracking-normal text-foreground sm:text-7xl">
            Meet Without Fear
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            A quieter way through the conversations that matter most. Start in private,
            feel heard, and move toward repair without rushing into a reactive exchange.
          </p>

          <div className="mx-auto mt-12 max-w-2xl">
            <TransformationPairs />
          </div>

          <div className="mt-16 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-medium text-accent-foreground transition hover:opacity-90"
            >
              Get started
              <ArrowRight className="h-5 w-5" strokeWidth={1.8} />
            </Link>
            <a
              href="#process"
              className="inline-flex items-center justify-center rounded-full border border-border bg-background-elevated px-7 py-4 text-base font-medium text-foreground transition hover:border-accent"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      <section id="process" className="border-y border-border bg-background-elevated py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              The process
            </p>
            <h2 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
              An airlock between two pressurized rooms.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              The app gives each person a separate space with the AI first. Nothing
              sensitive is shared by default, and the conversation only moves forward
              when the necessary readiness and consent are there.
            </p>
          </div>

          <ol className="grid gap-4 md:grid-cols-5">
            {PROCESS_STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-border bg-card p-5">
                <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-orange">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mb-3 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              What stays protected
            </p>
            <h2 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
              Built for emotional safety before progress.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<LockKeyhole className="h-5 w-5" strokeWidth={1.7} />}
              title="Private first"
              description="Raw venting and reflection stay with you unless you explicitly approve sharing."
            />
            <FeatureCard
              icon={<MessageCircle className="h-5 w-5" strokeWidth={1.7} />}
              title="Being heard"
              description="The AI reflects your side back clearly without taking sides or endorsing blame."
            />
            <FeatureCard
              icon={<Pause className="h-5 w-5" strokeWidth={1.7} />}
              title="Paced by readiness"
              description="Stage gates and emotional check-ins keep the process from moving too fast."
            />
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" strokeWidth={1.7} />}
              title="Small repair"
              description="The goal is a small, reversible next step both people are willing to try."
            />
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background-elevated py-20">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-6">
          <h2 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
            Ready when the words are not.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Open the app and begin with what you can say. The process will slow
            everything down from there.
          </p>
          <Link
            href="/app"
            className="mt-9 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 text-base font-medium text-accent-foreground transition hover:opacity-90"
          >
            Open Meet Without Fear
            <ArrowRight className="h-5 w-5" strokeWidth={1.8} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>&copy; {new Date().getFullYear()} Meet Without Fear</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

const PROCESS_STEPS = [
  {
    title: "Start privately",
    body: "Each person begins with the AI, not with a live confrontation.",
  },
  {
    title: "Feel heard",
    body: "The first gate is being accurately reflected before anything is shared.",
  },
  {
    title: "Stretch perspective",
    body: "Each side practices understanding the other without excusing or debating.",
  },
  {
    title: "Name needs",
    body: "The app helps clarify what matters underneath the conflict, with consent before reveal.",
  },
  {
    title: "Try repair",
    body: "Both people look for small, reversible experiments they can genuinely attempt.",
  },
] as const;

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background-elevated text-brand-orange">
        {icon}
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
