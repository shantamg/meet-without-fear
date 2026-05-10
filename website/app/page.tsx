import Link from "next/link";
import Image from "next/image";
import { ArrowRight, LockKeyhole, MessageCircle, Pause, Sparkles } from "lucide-react";

import { ChatExchange } from "@/components/chat-exchange";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
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

      {/* HERO — asymmetric editorial layout: oversized display type left, live chat right. */}
      <section className="paper-grain relative overflow-hidden">
        {/* soft warm glow behind the type */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[640px] w-[640px] -translate-x-[60%] rounded-full bg-[var(--accent-soft)] opacity-60 blur-3xl"
        />
        <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl content-center gap-x-12 gap-y-16 px-5 pb-24 pt-16 sm:px-6 lg:grid-cols-12 lg:gap-y-0 lg:pb-28 lg:pt-20">
          {/* Left: title + lede + CTAs */}
          <div className="text-center lg:col-span-7 lg:text-left">
            <div className="mb-7 flex items-center justify-center gap-3 lg:justify-start">
              <Image src="/logo.svg" alt="" width={56} height={48} priority />
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Guided conflict repair
              </p>
            </div>

            <h1 className="font-display text-[clamp(2rem,8.4vw,6.75rem)] leading-[0.92] tracking-[-0.01em] text-foreground">
              <span className="lg:block">Meet </span>
              <span className="italic text-accent-text lg:block">Without </span>
              <span className="lg:block">Fear.</span>
            </h1>

            <p className="mx-auto mt-8 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl lg:mx-0">
              A quieter way through the conversations that matter most. Start in
              private, feel heard, and move toward repair without rushing into a
              reactive exchange.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href="/app"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-medium text-accent-foreground transition hover:opacity-90"
              >
                Get started
                <ArrowRight className="h-5 w-5" strokeWidth={1.8} />
              </Link>
            </div>
          </div>

          {/* Mobile divider between title block and chat exchange */}
          <div
            aria-hidden
            className="mx-auto h-px w-24 bg-border lg:hidden"
          />

          {/* Right: live chat exchange — the visual proof */}
          <div className="lg:col-span-5 lg:pl-4 lg:flex lg:items-center">
            <div className="w-full px-2 py-4 sm:px-4 lg:-translate-y-10">
              <ChatExchange />
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="bg-background-elevated py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              The process
            </p>
            <h2 className="font-display text-4xl leading-[1.05] text-foreground sm:text-6xl">
              A buffer between
              <br />
              <span className="italic text-accent-text">two people.</span>
            </h2>
            <p className="mt-6 text-base leading-7 text-muted-foreground">
              Meet Without Fear helps each side settle, be heard, and move toward
              a next step without rushing into a reactive conversation.
            </p>
          </div>

          <ol className="grid gap-4 md:grid-cols-5">
            {PROCESS_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-lg border border-border bg-card px-5 pb-6 pt-6"
              >
                {index < PROCESS_STEPS.length - 1 && (
                  <span
                    className="pointer-events-none absolute right-[-1rem] top-8 hidden h-px w-4 bg-border md:block"
                    aria-hidden
                  />
                )}
                <h3 className="mb-4 font-display text-2xl italic leading-tight text-accent-text md:text-[1.65rem]">
                  {step.title}
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="bg-background py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              What stays protected
            </p>
            <h2 className="font-display text-4xl leading-[1.05] text-foreground sm:text-6xl">
              Built for
              <br />
              <span className="italic text-accent-text">emotional safety</span>
              <br />
              before progress.
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

      {/* Final CTA */}
      <section className="bg-background-elevated py-24">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-6">
          <h2 className="font-display text-4xl leading-[1.05] text-foreground sm:text-6xl">
            Ready when the
            <br />
            <span className="italic text-accent-text">words are not.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground">
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
    title: "Start in private",
    body: "Each person works with the AI separately. The app slows things down before anyone is asked to respond directly.",
  },
  {
    title: "Be fully heard",
    body: "You first tell your side without interruption. The AI reflects it back until you feel accurately understood.",
  },
  {
    title: "Practice understanding",
    body: "When both people are ready, the process helps each of you understand the other person without excusing or debating what happened.",
  },
  {
    title: "Name what matters",
    body: "You clarify the needs underneath the conflict, choose what to share, and only reveal it when both people have consented.",
  },
  {
    title: "Try a small repair",
    body: "The final step looks for small, reversible experiments both people are willing to try, then turns overlap into a clear next step.",
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
