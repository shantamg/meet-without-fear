import Link from "next/link";
import Image from "next/image";

export default function TermsPage() {
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
        </div>
      </header>

      {/* Content */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 max-w-3xl">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-12">Last updated: April 19, 2026</p>

          <div className="space-y-8 text-foreground/90 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing or using the Meet Without Fear mobile application and website
                (collectively, the &ldquo;Service&rdquo;), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
              <p className="text-muted-foreground">
                Meet Without Fear provides an AI-assisted conflict resolution platform that helps
                users navigate difficult conversations. The Service includes guided conversation
                sessions, individual reflection tools, and collaborative resolution features.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
              <p className="text-muted-foreground">
                You are responsible for maintaining the confidentiality of your account credentials
                and for all activities that occur under your account. You must provide accurate
                and complete information when creating your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
              <p className="text-muted-foreground">
                You agree to use the Service only for its intended purpose of conflict resolution
                and personal growth. You may not use the Service to harass, abuse, or harm others,
                or in any way that violates applicable laws or regulations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Privacy</h2>
              <p className="text-muted-foreground">
                Your use of the Service is also governed by our{" "}
                <Link href="/privacy" className="text-brand-cyan hover:underline">
                  Privacy Policy
                </Link>
                . Session data and conversations are encrypted and never shared with third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
              <p className="text-muted-foreground">
                The Service and its original content, features, and functionality are owned by
                Meet Without Fear and are protected by copyright, trademark, and other intellectual
                property laws.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                Meet Without Fear is not a substitute for professional therapy, counseling, or
                legal advice. The Service is designed to help with everyday conflicts and
                communication challenges. For serious mental health concerns or domestic issues,
                please seek professional support.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We reserve the right to modify these terms at any time. We will notify users of
                significant changes through the app or via email. Continued use of the Service
                after changes constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
              <p className="text-muted-foreground">
                If you have questions about these Terms of Service, please contact us at{" "}
                <a
                  href="mailto:support@meetwithoutfear.com"
                  className="text-brand-cyan hover:underline"
                >
                  support@meetwithoutfear.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
          <p>&copy; {new Date().getFullYear()} Meet Without Fear. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
