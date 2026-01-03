import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Shield, Heart, MessageCircle, Users } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Gradient Top Bar */}
      <div className="h-1 bg-gradient-top" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Meet Without Fear" width={48} height={40} />
            <span className="hidden min-[430px]:inline text-xl font-bold text-white">meet</span>
            <span className="hidden min-[430px]:inline text-xl font-bold text-brand-cyan">without fear</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/app"
              className="hidden min-[430px]:inline-flex bg-brand-orange text-accent-foreground px-4 py-2 rounded-lg font-medium hover:bg-brand-orange/90 transition-colors"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="container mx-auto px-6 text-center">
          {/* Large Logo */}
          <div className="flex justify-center -mb-2">
            <Image src="/logo.svg" alt="Meet Without Fear Logo" width={220} height={185} priority />
          </div>

          {/* Brand Name with Swoosh */}
          <div className="mb-8">
            <h1 className="text-6xl md:text-7xl font-bold text-white mb-2">meet</h1>
            <div className="inline-block swoosh-underline">
              <span className="text-3xl md:text-3xl text-muted-foreground">without fear</span>
            </div>
          </div>

          {/* Transformation Pairs */}
          <div className="mb-12">
            <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10 text-sm md:text-base">
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">Heated</span>
                <span className="text-brand-cyan">→</span>
                <span className="text-foreground font-medium">Heard</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">Enemy</span>
                <span className="text-brand-cyan">→</span>
                <span className="text-foreground font-medium">Human</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">Blame</span>
                <span className="text-brand-cyan">→</span>
                <span className="text-foreground font-medium">Needs</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">Opposition</span>
                <span className="text-brand-cyan">→</span>
                <span className="text-foreground font-medium">Win-Win</span>
              </span>
            </div>
          </div>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10">
            Transform difficult conversations into opportunities for connection and understanding.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 bg-brand-orange text-accent-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand-orange/90 transition-all hover:scale-105"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Meet Without Fear?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<Heart className="w-8 h-8 text-brand-orange" />}
              title="Build Connection"
              description="Strengthen your relationships through guided, meaningful conversations."
            />
            <FeatureCard
              icon={<MessageCircle className="w-8 h-8 text-brand-blue" />}
              title="AI-Guided Support"
              description="Receive gentle, personalized guidance to navigate difficult topics."
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-brand-navy" />}
              title="Safe Space"
              description="Your conversations are private and secure, creating a judgment-free zone."
            />
            <FeatureCard
              icon={<Users className="w-8 h-8 text-brand-orange" />}
              title="Together"
              description="Work through challenges as partners, not adversaries."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Start?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Download the app and begin your journey toward better communication and deeper connection.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 bg-brand-orange text-black px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand-orange/90 transition-all hover:scale-105"
          >
            Download the App
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} Meet Without Fear. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}

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
    <div className="bg-card p-6 rounded-xl border border-border hover:border-accent/50 transition-all">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
